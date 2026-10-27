import type { MovementReason, MovementType, Prisma } from "@prisma/client";
import { z, optDate, optId, optText, reqInt, reqText, checkbox } from "@/lib/validation";
import { addDays, berlinToday } from "@/lib/format";
import { db } from "../db";
import type { Actor } from "../actor";
import { can, requirePermission } from "../actor";
import { vehicleWhere } from "../access";
import { audit } from "../audit";
import { forbidden, invalid, notFound } from "../errors";
import { getSettings } from "../settings";
import { parse } from "../validate";
import { changeBatch, changeWarehouseQuantity, createMovement, findOrCreateBatch, lockWarehouseStock } from "./stock-core";

// ───────────── Lager & Lagerorte ─────────────

export async function listWarehouses(actor: Actor) {
  if (!can(actor, "warehouse.view") && !can(actor, "materials.manage")) throw forbidden();
  return db.warehouse.findMany({
    include: { locations: { where: { archived: false }, orderBy: { name: "asc" }, include: { _count: { select: { stocks: true } } } } },
    orderBy: { name: "asc" },
  });
}

export async function upsertWarehouse(actor: Actor, input: unknown) {
  requirePermission(actor, "warehouse.manage");
  const d = parse(z.object({ id: optId(), name: reqText(100), description: optText(500) }), input);
  const dup = await db.warehouse.findFirst({ where: { name: { equals: d.name, mode: "insensitive" }, ...(d.id ? { id: { not: d.id } } : {}) } });
  if (dup) throw invalid("Lager existiert bereits", { name: "Bereits vorhanden" });
  const w = d.id
    ? await db.warehouse.update({ where: { id: d.id }, data: { name: d.name, description: d.description ?? null } })
    : await db.warehouse.create({ data: { name: d.name, description: d.description } });
  await audit(actor, { action: "master.update", entityType: "Warehouse", entityId: w.id, newValues: d });
  return w;
}

export async function upsertLocation(actor: Actor, input: unknown) {
  requirePermission(actor, "warehouse.manage");
  const d = parse(z.object({ id: optId(), warehouseId: z.string().min(1), name: reqText(100), code: optText(40), description: optText(500), archived: checkbox() }), input);
  const dup = await db.storageLocation.findFirst({ where: { warehouseId: d.warehouseId, name: { equals: d.name, mode: "insensitive" }, ...(d.id ? { id: { not: d.id } } : {}) } });
  if (dup) throw invalid("Lagerort existiert bereits", { name: "Bereits vorhanden" });
  if (d.archived && d.id) {
    const stocked = await db.warehouseStock.count({ where: { locationId: d.id, quantity: { gt: 0 } } });
    if (stocked) throw invalid("Lagerort enthält noch Bestand.", { archived: "Bestand vorhanden" });
  }
  const data = { warehouseId: d.warehouseId, name: d.name, code: d.code ?? null, description: d.description ?? null, archived: d.archived };
  const l = d.id ? await db.storageLocation.update({ where: { id: d.id }, data }) : await db.storageLocation.create({ data });
  await audit(actor, { action: "master.update", entityType: "StorageLocation", entityId: l.id, newValues: d });
  return l;
}

/** Lagerorte für Auswahllisten (z. B. Nachfüll-Lagerort einer Fahrzeugposition). */
export async function locationOptions() {
  return db.storageLocation.findMany({ where: { archived: false }, include: { warehouse: true }, orderBy: [{ warehouse: { name: "asc" } }, { name: "asc" }] });
}

// ───────────── Lagerbestände ─────────────

export async function listWarehouseStock(actor: Actor, f: { q?: string; locationId?: string; categoryId?: string; state?: string } = {}) {
  requirePermission(actor, "warehouse.view");
  const settings = await getSettings();
  const today = berlinToday();
  const soon = addDays(today, settings.expiryWarningDays);
  const rows = await db.warehouseStock.findMany({
    where: {
      ...(f.locationId ? { locationId: f.locationId } : {}),
      material: {
        ...(f.q ? { name: { contains: f.q, mode: "insensitive" as const } } : {}),
        ...(f.categoryId ? { categoryId: f.categoryId } : {}),
        ...(settings.medicationsEnabled ? {} : { category: { isMedication: false } }),
      },
    },
    include: {
      material: { include: { category: true } },
      location: { include: { warehouse: true } },
      batches: { where: { quantity: { gt: 0 } }, orderBy: { expiryDate: "asc" } },
    },
    orderBy: [{ material: { name: "asc" } }],
  });
  const enriched = rows.map((s) => ({
    ...s,
    belowMin: s.quantity < s.minQuantity,
    expiredQty: s.batches.filter((b) => b.expiryDate && b.expiryDate < today).reduce((n, b) => n + b.quantity, 0),
    expiringQty: s.batches.filter((b) => b.expiryDate && b.expiryDate >= today && b.expiryDate <= soon).reduce((n, b) => n + b.quantity, 0),
  }));
  if (f.state === "low") return enriched.filter((s) => s.belowMin);
  if (f.state === "expiring") return enriched.filter((s) => s.expiredQty > 0 || s.expiringQty > 0);
  return enriched;
}

const receiptSchema = z.object({
  materialId: z.string().min(1, "Bitte Material wählen"),
  locationId: z.string().min(1, "Bitte Lagerort wählen"),
  quantity: reqInt(1, 1_000_000),
  batchNumber: optText(80),
  expiryDate: optDate(),
  minQuantity: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(0).max(1_000_000).optional()),
  note: optText(1000),
});

/** Wareneingang ins zentrale Lager. */
export async function receiveStock(actor: Actor, input: unknown) {
  requirePermission(actor, "warehouse.manage");
  const d = parse(receiptSchema, input);
  const material = await db.material.findUnique({ where: { id: d.materialId } });
  if (!material || material.archived) throw invalid("Material ungültig", { materialId: "Ungültig" });
  const loc = await db.storageLocation.findUnique({ where: { id: d.locationId } });
  if (!loc || loc.archived) throw invalid("Lagerort ungültig", { locationId: "Ungültig" });
  if (material.batchTracked && !d.expiryDate) throw invalid("Für chargengeführtes Material ist ein Verfallsdatum erforderlich.", { expiryDate: "Pflichtfeld" });

  return db.$transaction(async (tx) => {
    const ws = await tx.warehouseStock.upsert({
      where: { materialId_locationId: { materialId: d.materialId, locationId: d.locationId } },
      create: { materialId: d.materialId, locationId: d.locationId, quantity: 0, minQuantity: d.minQuantity ?? 0 },
      update: d.minQuantity != null ? { minQuantity: d.minQuantity } : {},
    });
    await lockWarehouseStock(tx, ws.id);
    let batchId: string | undefined;
    if (material.batchTracked) {
      const b = await findOrCreateBatch(tx, { warehouseStockId: ws.id }, material.id, d.batchNumber, d.expiryDate);
      await changeBatch(tx, b.id, d.quantity);
      batchId = b.id;
    }
    await changeWarehouseQuantity(tx, ws.id, d.quantity);
    const m = await createMovement(tx, actor, {
      type: "RECEIPT",
      materialId: material.id,
      quantity: d.quantity,
      toWarehouseStockId: ws.id,
      batchId,
      batchNumber: d.batchNumber,
      expiryDate: d.expiryDate,
      note: d.note,
    });
    await audit(actor, { action: "warehouse.receipt", entityType: "WarehouseStock", entityId: ws.id, oldValues: { quantity: ws.quantity }, newValues: { quantity: ws.quantity + d.quantity, material: material.name, batchNumber: d.batchNumber, expiryDate: d.expiryDate } }, tx);
    return m;
  });
}

const issueSchema = z.object({
  warehouseStockId: z.string().min(1),
  batchId: optId(),
  quantity: reqInt(1, 1_000_000),
  mode: z.enum(["ISSUE", "WRITE_OFF", "CORRECTION"]),
  reason: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["EXPIRED", "USED", "DAMAGED", "LOST", "OTHER"]).optional()),
  countedQuantity: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(0).optional()),
  note: optText(1000),
});

/** Entnahme, Austragung (z. B. abgelaufen) oder Inventurkorrektur im Lager. */
export async function warehouseMovement(actor: Actor, input: unknown) {
  requirePermission(actor, "warehouse.manage");
  const d = parse(issueSchema, input);
  if (d.mode !== "CORRECTION" && !d.reason) throw invalid("Bitte Grund wählen.", { reason: "Pflichtfeld" });
  if (d.mode === "CORRECTION" && !d.note) throw invalid("Bitte die Korrektur begründen.", { note: "Pflichtfeld" });

  return db.$transaction(async (tx) => {
    const ws = await lockWarehouseStock(tx, d.warehouseStockId);
    let batch = null;
    if (ws.material.batchTracked) {
      if (!d.batchId) throw invalid("Bitte das Verfallsdatum wählen.", { batchId: "Pflichtfeld" });
      batch = await tx.materialBatch.findFirst({ where: { id: d.batchId, warehouseStockId: ws.id } });
      if (!batch) throw invalid("Verfallsdatum ungültig", { batchId: "Ungültig" });
    }
    let delta: number;
    if (d.mode === "CORRECTION") {
      if (d.countedQuantity == null) throw invalid("Gezählte Menge angeben.", { countedQuantity: "Pflichtfeld" });
      delta = d.countedQuantity - (batch ? batch.quantity : ws.quantity);
      if (delta === 0) return null;
    } else {
      delta = -d.quantity;
      const available = batch ? batch.quantity : ws.quantity;
      if (available < d.quantity) throw invalid(`Nur ${available} vorhanden.`, { quantity: `Maximal ${available}` });
    }
    if (batch) await changeBatch(tx, batch.id, delta);
    await changeWarehouseQuantity(tx, ws.id, delta);
    const m = await createMovement(tx, actor, {
      type: d.mode as MovementType,
      reason: (d.reason as MovementReason | undefined) ?? null,
      materialId: ws.materialId,
      quantity: delta,
      ...(delta > 0 ? { toWarehouseStockId: ws.id } : { fromWarehouseStockId: ws.id }),
      batchId: batch?.id,
      batchNumber: batch?.batchNumber,
      expiryDate: batch?.expiryDate,
      note: d.note,
    });
    await audit(actor, { action: "warehouse.issue", entityType: "WarehouseStock", entityId: ws.id, oldValues: { quantity: ws.quantity }, newValues: { quantity: ws.quantity + delta, mode: d.mode, reason: d.reason, batchNumber: batch?.batchNumber } }, tx);
    return m;
  });
}

export async function setWarehouseMin(actor: Actor, warehouseStockId: string, minQuantity: number) {
  requirePermission(actor, "warehouse.manage");
  if (!Number.isInteger(minQuantity) || minQuantity < 0) throw invalid("Ungültiger Mindestbestand");
  const ws = await db.warehouseStock.findUnique({ where: { id: warehouseStockId } });
  if (!ws) throw notFound();
  await db.$transaction(async (tx) => {
    await tx.warehouseStock.update({ where: { id: warehouseStockId }, data: { minQuantity } });
    await audit(actor, { action: "master.update", entityType: "WarehouseStock", entityId: ws.id, oldValues: { minQuantity: ws.minQuantity }, newValues: { minQuantity } }, tx);
  });
}

// ───────────── Bewegungshistorie ─────────────

export type MovementFilter = { materialId?: string; vehicleId?: string; type?: string; from?: Date; to?: Date; locationId?: string };

export function movementWhere(actor: Actor, f: MovementFilter): Prisma.StockMovementWhereInput {
  const and: Prisma.StockMovementWhereInput[] = [];
  // Berechtigungen: Lagersicht ODER Bewegungen der sichtbaren Fahrzeuge
  if (!can(actor, "warehouse.view")) {
    if (!can(actor, "materials.view")) return { id: { in: [] } };
    const vw = vehicleWhere(actor, true);
    and.push({ OR: [{ fromVehicleStock: { vehicle: vw } }, { toVehicleStock: { vehicle: vw } }] });
  } else if (!can(actor, "vehicles.view_all")) {
    const vw = vehicleWhere(actor, true);
    and.push({
      OR: [
        { fromVehicleStockId: null, toVehicleStockId: null },
        { fromVehicleStock: { vehicle: vw } },
        { toVehicleStock: { vehicle: vw } },
      ],
    });
  }
  if (f.materialId) and.push({ materialId: f.materialId });
  if (f.vehicleId) and.push({ OR: [{ fromVehicleStock: { vehicleId: f.vehicleId } }, { toVehicleStock: { vehicleId: f.vehicleId } }] });
  if (f.type) and.push({ type: f.type as MovementType });
  if (f.locationId) and.push({ OR: [{ fromWarehouseStock: { locationId: f.locationId } }, { toWarehouseStock: { locationId: f.locationId } }] });
  if (f.from || f.to) and.push({ createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } });
  return { AND: and };
}

export async function listMovements(actor: Actor, f: MovementFilter = {}, take = 300) {
  return db.stockMovement.findMany({
    where: movementWhere(actor, f),
    include: {
      material: { select: { name: true, unit: true } },
      user: { select: { firstName: true, lastName: true } },
      fromVehicleStock: { select: { vehicle: { select: { id: true, name: true } }, compartment: true } },
      toVehicleStock: { select: { vehicle: { select: { id: true, name: true } }, compartment: true } },
      fromWarehouseStock: { select: { location: { select: { name: true, warehouse: { select: { name: true } } } } } },
      toWarehouseStock: { select: { location: { select: { name: true, warehouse: { select: { name: true } } } } } },
      _count: { select: { attachments: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}
