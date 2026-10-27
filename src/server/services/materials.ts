import type { MovementReason, Prisma } from "@prisma/client";
import { z, optDate, optId, optInt, optText, reqInt, reqText, checkbox } from "@/lib/validation";
import { addDays, berlinToday } from "@/lib/format";
import { ACTIVE_REFILL_STATUSES, MOVEMENT_REASON } from "@/lib/labels";
import { db } from "../db";
import type { Actor } from "../actor";
import { can, requirePermission } from "../actor";
import { assertVehicleAccess, viaVehicle } from "../access";
import { audit, diff } from "../audit";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { notify, recipientsFor } from "../notifications";
import { getSettings } from "../settings";
import { parse } from "../validate";
import { linkAttachments } from "./attachments";
import { changeBatch, changeVehicleQuantity, createMovement, findOrCreateBatch, lockVehicleStock, syncRefillRequest } from "./stock-core";

export const WRITE_OFF_REASONS = ["EXPIRED", "USED", "DAMAGED", "LOST", "OTHER"] as const;

// ───────────── Katalog & Kategorien ─────────────

export async function listCategories(opts: { includeMedication?: boolean } = {}) {
  const settings = await getSettings();
  return db.materialCategory.findMany({
    where: settings.medicationsEnabled || opts.includeMedication ? {} : { isMedication: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function upsertCategory(actor: Actor, input: unknown) {
  requirePermission(actor, "materials.catalog");
  const d = parse(z.object({ id: optId(), name: reqText(80), sortOrder: optInt(0, 1000), isMedication: checkbox() }), input);
  const dup = await db.materialCategory.findFirst({ where: { name: { equals: d.name, mode: "insensitive" }, ...(d.id ? { id: { not: d.id } } : {}) } });
  if (dup) throw invalid("Kategorie existiert bereits", { name: "Bereits vorhanden" });
  const data = { name: d.name, sortOrder: d.sortOrder ?? 0, isMedication: d.isMedication };
  const c = d.id ? await db.materialCategory.update({ where: { id: d.id }, data }) : await db.materialCategory.create({ data });
  await audit(actor, { action: "master.update", entityType: "MaterialCategory", entityId: c.id, newValues: data });
  return c;
}

const materialSchema = z.object({
  name: reqText(150),
  articleNumber: optText(60),
  categoryId: z.string().min(1, "Bitte Kategorie wählen"),
  description: optText(2000),
  unit: reqText(30),
  manufacturer: optText(100),
  batchTracked: checkbox(),
  remarks: optText(2000),
});

async function assertCategoryAllowed(categoryId: string) {
  const cat = await db.materialCategory.findUnique({ where: { id: categoryId } });
  if (!cat) throw invalid("Kategorie ungültig", { categoryId: "Ungültig" });
  if (cat.isMedication && !(await getSettings()).medicationsEnabled)
    throw invalid("Die Medikamentenverwaltung ist nicht freigeschaltet.", { categoryId: "Medikamente nicht freigeschaltet" });
}

export async function listMaterials(actor: Actor, filter: { q?: string; categoryId?: string; includeArchived?: boolean } = {}) {
  if (!can(actor, "materials.view") && !can(actor, "warehouse.view")) throw forbidden();
  const settings = await getSettings();
  return db.material.findMany({
    where: {
      ...(filter.includeArchived ? {} : { archived: false }),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(settings.medicationsEnabled ? {} : { category: { isMedication: false } }),
      ...(filter.q
        ? { OR: [{ name: { contains: filter.q, mode: "insensitive" } }, { articleNumber: { contains: filter.q, mode: "insensitive" } }] }
        : {}),
    },
    include: { category: true, _count: { select: { vehicleStocks: true, warehouseStocks: true } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });
}

export async function createMaterial(actor: Actor, input: unknown, imageId?: string) {
  requirePermission(actor, "materials.catalog");
  const d = parse(materialSchema, input);
  await assertCategoryAllowed(d.categoryId);
  const dup = await db.material.findFirst({ where: { name: { equals: d.name, mode: "insensitive" }, articleNumber: d.articleNumber ?? null } });
  if (dup) throw invalid("Material existiert bereits", { name: "Bereits im Katalog" });
  return db.$transaction(async (tx) => {
    const m = await tx.material.create({ data: d });
    if (imageId) await setMaterialImage(tx, actor, m.id, imageId);
    await audit(actor, { action: "master.update", entityType: "Material", entityId: m.id, newValues: d }, tx);
    return m;
  });
}

export async function updateMaterial(actor: Actor, id: string, input: unknown, imageId?: string) {
  requirePermission(actor, "materials.catalog");
  const before = await db.material.findUnique({ where: { id } });
  if (!before) throw notFound();
  const d = parse(materialSchema.extend({ archived: checkbox() }), input);
  await assertCategoryAllowed(d.categoryId);
  if (before.batchTracked && !d.batchTracked) {
    const batches = await db.materialBatch.count({ where: { materialId: id, quantity: { gt: 0 } } });
    if (batches) throw invalid("Chargenführung kann nicht deaktiviert werden, solange Chargen Bestand haben.", { batchTracked: "Chargen vorhanden" });
  }
  if (!before.batchTracked && d.batchTracked) {
    const stocked = await db.vehicleMaterialStock.count({ where: { materialId: id, currentQuantity: { gt: 0 } } });
    const wStocked = await db.warehouseStock.count({ where: { materialId: id, quantity: { gt: 0 } } });
    if (stocked || wStocked)
      throw invalid("Chargenführung kann nur aktiviert werden, solange kein Bestand vorhanden ist.", { batchTracked: "Bestand vorhanden" });
  }
  const { oldValues, newValues, changed } = diff(before as unknown as Record<string, unknown>, { ...d, articleNumber: d.articleNumber ?? null });
  await db.$transaction(async (tx) => {
    await tx.material.update({ where: { id }, data: { ...d, articleNumber: d.articleNumber ?? null, description: d.description ?? null, manufacturer: d.manufacturer ?? null, remarks: d.remarks ?? null } });
    if (imageId) await setMaterialImage(tx, actor, id, imageId);
    if (changed) await audit(actor, { action: "master.update", entityType: "Material", entityId: id, oldValues, newValues }, tx);
  });
}

async function setMaterialImage(tx: Prisma.TransactionClient, actor: Actor, materialId: string, attachmentId: string) {
  const a = await tx.attachment.findFirst({ where: { id: attachmentId, uploadedById: actor.id, kind: "PHOTO", vehicleId: null, defectId: null } });
  if (!a) throw invalid("Produktbild ungültig");
  await tx.material.update({ where: { id: materialId }, data: { imageId: a.id } });
}

// ───────────── Fahrzeugbestände ─────────────

export async function listVehicleStock(actor: Actor, vehicleId: string, filter: { categoryId?: string; q?: string; state?: string } = {}) {
  requirePermission(actor, "materials.view");
  await assertVehicleAccess(actor, vehicleId);
  const settings = await getSettings();
  const today = berlinToday();
  const soon = addDays(today, settings.expiryWarningDays);
  const rows = await db.vehicleMaterialStock.findMany({
    where: {
      vehicleId,
      active: true,
      material: {
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.q ? { name: { contains: filter.q, mode: "insensitive" as const } } : {}),
        ...(settings.medicationsEnabled ? {} : { category: { isMedication: false } }),
      },
    },
    include: {
      material: { include: { category: true } },
      batches: { where: { quantity: { gt: 0 } }, orderBy: [{ expiryDate: "asc" }] },
      refillLocation: { include: { warehouse: true } },
      refillRequests: { where: { status: { in: [...ACTIVE_REFILL_STATUSES] } } },
    },
    orderBy: [{ material: { category: { sortOrder: "asc" } } }, { compartment: "asc" }, { material: { name: "asc" } }],
  });
  const enriched = rows.map((s) => {
    const expired = s.batches.filter((b) => b.expiryDate && b.expiryDate < today);
    const expiring = s.batches.filter((b) => b.expiryDate && b.expiryDate >= today && b.expiryDate <= soon);
    return {
      ...s,
      expiredQty: expired.reduce((n, b) => n + b.quantity, 0),
      expiringQty: expiring.reduce((n, b) => n + b.quantity, 0),
      missing: Math.max(0, s.targetQuantity - s.currentQuantity),
      belowMin: s.currentQuantity < s.minQuantity,
      activeRefill: s.refillRequests[0] ?? null,
      nextExpiry: s.batches.find((b) => b.expiryDate)?.expiryDate ?? null,
    };
  });
  if (filter.state === "missing") return enriched.filter((s) => s.missing > 0);
  if (filter.state === "expired") return enriched.filter((s) => s.expiredQty > 0);
  if (filter.state === "expiring") return enriched.filter((s) => s.expiringQty > 0 || s.expiredQty > 0);
  return enriched;
}

export async function getVehicleStock(actor: Actor, stockId: string) {
  requirePermission(actor, "materials.view");
  const s = await db.vehicleMaterialStock.findFirst({
    where: { id: stockId, ...viaVehicle(actor) },
    include: {
      vehicle: true,
      material: { include: { category: true } },
      batches: { orderBy: [{ expiryDate: "asc" }] },
      refillLocation: { include: { warehouse: true } },
      refillRequests: { orderBy: { createdAt: "desc" }, take: 20, include: { reportedBy: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!s) throw notFound("Materialposition nicht gefunden oder kein Zugriff.");
  const movements = await db.stockMovement.findMany({
    where: { OR: [{ fromVehicleStockId: stockId }, { toVehicleStockId: stockId }] },
    include: { user: { select: { firstName: true, lastName: true } }, attachments: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { ...s, movements };
}

const stockSchema = z.object({
  materialId: z.string().min(1, "Bitte Material wählen"),
  targetQuantity: reqInt(0, 100000),
  minQuantity: reqInt(0, 100000),
  compartment: optText(120),
  refillLocationId: optId(),
  remarks: optText(2000),
});

export async function createVehicleStock(
  actor: Actor,
  vehicleId: string,
  input: unknown,
  initial?: { quantity?: number; batches?: { batchNumber?: string; expiryDate?: Date; quantity: number }[] },
) {
  requirePermission(actor, "materials.manage");
  const vehicle = await assertVehicleAccess(actor, vehicleId, db, false);
  const d = parse(stockSchema, input);
  if (d.minQuantity > d.targetQuantity) throw invalid("Mindestbestand darf den Sollbestand nicht übersteigen.", { minQuantity: "Größer als Sollbestand" });
  const material = await db.material.findUnique({ where: { id: d.materialId }, include: { category: true } });
  if (!material || material.archived) throw invalid("Material ungültig", { materialId: "Ungültig" });
  await assertCategoryAllowed(material.categoryId);
  if (await db.vehicleMaterialStock.findUnique({ where: { vehicleId_materialId: { vehicleId, materialId: d.materialId } } }))
    throw invalid("Dieses Material ist im Fahrzeug bereits angelegt.", { materialId: "Bereits vorhanden" });

  return db.$transaction(async (tx) => {
    const stock = await tx.vehicleMaterialStock.create({ data: { ...d, vehicleId, currentQuantity: 0 } });
    await audit(actor, { action: "stock.create", entityType: "VehicleMaterialStock", entityId: stock.id, vehicleId, newValues: { material: material.name, ...d } }, tx);
    // Anfangsbestand wird als nachvollziehbare Bestandskorrektur gebucht
    if (material.batchTracked) {
      for (const b of initial?.batches ?? []) {
        if (!b.quantity) continue;
        const batch = await findOrCreateBatch(tx, { vehicleStockId: stock.id }, material.id, b.batchNumber, b.expiryDate);
        await changeBatch(tx, batch.id, b.quantity);
        await changeVehicleQuantity(tx, stock.id, b.quantity);
        await createMovement(tx, actor, { type: "CORRECTION", materialId: material.id, quantity: b.quantity, toVehicleStockId: stock.id, batchId: batch.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate, note: "Anfangsbestand" });
      }
    } else if (initial?.quantity) {
      await changeVehicleQuantity(tx, stock.id, initial.quantity);
      await createMovement(tx, actor, { type: "CORRECTION", materialId: material.id, quantity: initial.quantity, toVehicleStockId: stock.id, note: "Anfangsbestand" });
    }
    await syncRefillRequest(tx, actor, stock.id, `Neu angelegt in ${vehicle.name}`);
    return stock;
  });
}

export async function updateVehicleStock(actor: Actor, stockId: string, input: unknown) {
  requirePermission(actor, "materials.manage");
  const before = await getVehicleStock(actor, stockId);
  const d = parse(stockSchema.omit({ materialId: true }), input);
  if (d.minQuantity > d.targetQuantity) throw invalid("Mindestbestand darf den Sollbestand nicht übersteigen.", { minQuantity: "Größer als Sollbestand" });
  const data = { ...d, compartment: d.compartment ?? null, refillLocationId: d.refillLocationId ?? null, remarks: d.remarks ?? null };
  const { oldValues, newValues, changed } = diff(before as unknown as Record<string, unknown>, data);
  if (!changed) return;
  await db.$transaction(async (tx) => {
    await lockVehicleStock(tx, stockId);
    await tx.vehicleMaterialStock.update({ where: { id: stockId }, data });
    await audit(actor, { action: "stock.update", entityType: "VehicleMaterialStock", entityId: stockId, vehicleId: before.vehicleId, oldValues, newValues }, tx);
    if (d.targetQuantity !== before.targetQuantity) await syncRefillRequest(tx, actor, stockId, "Sollbestand geändert");
  });
}

export async function deactivateVehicleStock(actor: Actor, stockId: string) {
  requirePermission(actor, "materials.manage");
  const s = await getVehicleStock(actor, stockId);
  if (s.currentQuantity > 0) throw conflict("Position hat noch Bestand. Bitte zuerst austragen oder korrigieren.");
  await db.$transaction(async (tx) => {
    await tx.vehicleMaterialStock.update({ where: { id: stockId }, data: { active: false } });
    await tx.refillRequest.updateMany({ where: { vehicleStockId: stockId, status: { in: ["OPEN", "IN_PROGRESS"] } }, data: { status: "CANCELLED", closedAt: new Date() } });
    await audit(actor, { action: "stock.update", entityType: "VehicleMaterialStock", entityId: stockId, vehicleId: s.vehicleId, oldValues: { active: true }, newValues: { active: false } }, tx);
  });
}

// ───────────── Austragen (abgelaufen, verbraucht, beschädigt, verloren …) ─────────────

const writeOffSchema = z.object({
  stockId: z.string().min(1),
  quantity: reqInt(1, 100000),
  reason: z.enum(WRITE_OFF_REASONS),
  batchId: optId(),
  batchNumber: optText(80),
  expiryDate: optDate(),
  occurredAt: optDate(),
  note: optText(2000),
  clientRef: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
});

/**
 * Trägt Material aus dem Fahrzeugbestand aus und erzeugt bzw. aktualisiert automatisch die
 * Nachfüllanforderung. Bei chargengeführtem Material wird genau die gewählte Charge belastet –
 * andere Chargen desselben Artikels bleiben unberührt.
 */
export async function writeOffMaterial(actor: Actor, input: unknown, attachmentIds: string[] = []) {
  requirePermission(actor, "materials.report");
  const d = parse(writeOffSchema, input);
  if (d.reason === "OTHER" && !d.note) throw invalid("Bitte den Grund in der Bemerkung angeben.", { note: "Pflicht bei „Sonstiger Grund“" });

  // Zugriffsprüfung vor der Transaktion (NOT_FOUND bei fremden Fahrzeugen)
  const visible = await db.vehicleMaterialStock.findFirst({ where: { id: d.stockId, active: true, ...viaVehicle(actor) }, select: { id: true } });
  if (!visible) throw notFound("Materialposition nicht gefunden oder kein Zugriff.");

  if (d.clientRef) {
    const dup = await db.stockMovement.findUnique({ where: { clientRef: d.clientRef } });
    if (dup) return { movement: dup, duplicate: true, refill: null };
  }

  const result = await db.$transaction(async (tx) => {
    const stock = await lockVehicleStock(tx, d.stockId);
    if (stock.vehicle.archivedAt) throw conflict("Das Fahrzeug ist archiviert.");
    let batchNumber = d.batchNumber ?? null;
    let expiryDate = d.expiryDate ?? null;
    let batchId: string | null = null;

    if (stock.material.batchTracked) {
      if (!d.batchId) throw invalid("Bitte die betroffene Charge auswählen.", { batchId: "Charge erforderlich" });
      const batch = await tx.materialBatch.findFirst({ where: { id: d.batchId, vehicleStockId: stock.id } });
      if (!batch) throw invalid("Die gewählte Charge gehört nicht zu dieser Materialposition.", { batchId: "Ungültige Charge" });
      if (batch.quantity < d.quantity)
        throw invalid(`In dieser Charge sind nur ${batch.quantity} ${stock.material.unit} vorhanden.`, { quantity: `Maximal ${batch.quantity}` });
      await changeBatch(tx, batch.id, -d.quantity);
      batchId = batch.id;
      batchNumber = batch.batchNumber;
      expiryDate = batch.expiryDate;
    } else if (stock.currentQuantity < d.quantity) {
      throw invalid(`Im Fahrzeug sind nur ${stock.currentQuantity} ${stock.material.unit} vorhanden.`, { quantity: `Maximal ${stock.currentQuantity}` });
    }

    await changeVehicleQuantity(tx, stock.id, -d.quantity);
    const movement = await createMovement(tx, actor, {
      type: "WRITE_OFF",
      reason: d.reason as MovementReason,
      materialId: stock.materialId,
      quantity: -d.quantity,
      fromVehicleStockId: stock.id,
      batchId,
      batchNumber,
      expiryDate,
      occurredAt: d.occurredAt && d.occurredAt <= new Date() ? d.occurredAt : new Date(),
      note: d.note,
      clientRef: d.clientRef,
    });
    await linkAttachments(tx, actor, attachmentIds, { stockMovementId: movement.id });
    await tx.vehicleMaterialStock.update({ where: { id: stock.id }, data: { lastCheckedAt: new Date() } });
    await audit(
      actor,
      {
        action: "stock.writeoff",
        entityType: "VehicleMaterialStock",
        entityId: stock.id,
        vehicleId: stock.vehicleId,
        oldValues: { currentQuantity: stock.currentQuantity },
        newValues: { currentQuantity: stock.currentQuantity - d.quantity, quantity: d.quantity, reason: d.reason, batchNumber, expiryDate },
      },
      tx,
    );
    const reasonText = `${MOVEMENT_REASON[d.reason]}: ${d.quantity} ${stock.material.unit} ausgetragen`;
    const refill = await syncRefillRequest(tx, actor, stock.id, reasonText);

    if (d.reason === "EXPIRED" || d.reason === "LOST") {
      const r = await recipientsFor({ permission: "materials.manage", vehicleId: stock.vehicleId, excludeUserId: actor.id }, tx);
      await notify(r, { type: "material_issue", title: `${MOVEMENT_REASON[d.reason]}es Material: ${stock.vehicle.name}`, body: `${d.quantity} ${stock.material.unit} ${stock.material.name}`, link: `/fahrzeuge/${stock.vehicleId}/material`, dedupeKey: `writeoff:${movement.id}` }, tx);
    }
    return { movement, duplicate: false, refill };
  });
  return result;
}

// ───────────── Bestandskorrektur / Inventur / Chargen einbuchen ─────────────

const correctionSchema = z.object({
  stockId: z.string().min(1),
  batchId: optId(),
  newBatch: checkbox(),
  batchNumber: optText(80),
  expiryDate: optDate(),
  countedQuantity: reqInt(0, 100000),
  note: reqText(1000),
});

/**
 * Inventurkorrektur: gezählte Menge eintragen; die Differenz wird als Korrekturbewegung gebucht.
 * Für chargengeführtes Material je Charge (oder neue Charge mit Verfallsdatum).
 */
export async function correctVehicleStock(actor: Actor, input: unknown) {
  requirePermission(actor, "materials.manage");
  const d = parse(correctionSchema, input);
  const visible = await db.vehicleMaterialStock.findFirst({ where: { id: d.stockId, active: true, ...viaVehicle(actor) }, select: { id: true } });
  if (!visible) throw notFound("Materialposition nicht gefunden oder kein Zugriff.");

  return db.$transaction(async (tx) => {
    const stock = await lockVehicleStock(tx, d.stockId);
    let delta: number;
    let batch: { id: string; batchNumber: string | null; expiryDate: Date | null } | null = null;
    if (stock.material.batchTracked) {
      if (d.newBatch) {
        if (!d.expiryDate) throw invalid("Verfallsdatum der neuen Charge angeben.", { expiryDate: "Pflichtfeld" });
        const b = await findOrCreateBatch(tx, { vehicleStockId: stock.id }, stock.materialId, d.batchNumber, d.expiryDate);
        delta = d.countedQuantity - b.quantity;
        batch = b;
      } else {
        if (!d.batchId) throw invalid("Bitte Charge wählen.", { batchId: "Pflichtfeld" });
        const b = await tx.materialBatch.findFirst({ where: { id: d.batchId, vehicleStockId: stock.id } });
        if (!b) throw invalid("Charge ungültig", { batchId: "Ungültig" });
        delta = d.countedQuantity - b.quantity;
        batch = b;
      }
      if (delta !== 0) await changeBatch(tx, batch.id, delta);
    } else {
      delta = d.countedQuantity - stock.currentQuantity;
    }
    if (delta === 0) {
      await tx.vehicleMaterialStock.update({ where: { id: stock.id }, data: { lastCheckedAt: new Date() } });
      return { delta };
    }
    await changeVehicleQuantity(tx, stock.id, delta);
    await createMovement(tx, actor, {
      type: "CORRECTION",
      materialId: stock.materialId,
      quantity: delta,
      ...(delta > 0 ? { toVehicleStockId: stock.id } : { fromVehicleStockId: stock.id }),
      batchId: batch?.id,
      batchNumber: batch?.batchNumber,
      expiryDate: batch?.expiryDate,
      note: d.note,
    });
    await tx.vehicleMaterialStock.update({ where: { id: stock.id }, data: { lastCheckedAt: new Date() } });
    await audit(actor, { action: "stock.correction", entityType: "VehicleMaterialStock", entityId: stock.id, vehicleId: stock.vehicleId, oldValues: { currentQuantity: stock.currentQuantity }, newValues: { currentQuantity: stock.currentQuantity + delta, delta, note: d.note, batchNumber: batch?.batchNumber } }, tx);
    await syncRefillRequest(tx, actor, stock.id, "Bestandskorrektur");
    return { delta };
  });
}

/** Material als geprüft markieren (Bestandskontrolle ohne Abweichung). */
export async function markStockChecked(actor: Actor, vehicleId: string, stockIds?: string[]) {
  requirePermission(actor, "materials.report");
  await assertVehicleAccess(actor, vehicleId, db, false);
  const res = await db.vehicleMaterialStock.updateMany({
    where: { vehicleId, active: true, ...(stockIds?.length ? { id: { in: stockIds } } : {}) },
    data: { lastCheckedAt: new Date() },
  });
  return res.count;
}

// ───────────── Ablaufende Materialien ─────────────

export async function expiringBatches(actor: Actor, opts: { days?: number; vehicleId?: string; includeWarehouse?: boolean } = {}) {
  const settings = await getSettings();
  const limit = addDays(berlinToday(), opts.days ?? settings.expiryWarningDays);
  const vehicleBatches = can(actor, "materials.view")
    ? await db.materialBatch.findMany({
        where: {
          quantity: { gt: 0 },
          expiryDate: { lte: limit },
          vehicleStock: { active: true, ...viaVehicle(actor), ...(opts.vehicleId ? { vehicleId: opts.vehicleId } : {}) },
        },
        include: { material: { include: { category: true } }, vehicleStock: { include: { vehicle: { select: { id: true, name: true, licensePlate: true } } } } },
        orderBy: { expiryDate: "asc" },
      })
    : [];
  const warehouseBatches =
    opts.includeWarehouse && can(actor, "warehouse.view") && !opts.vehicleId
      ? await db.materialBatch.findMany({
          where: { quantity: { gt: 0 }, expiryDate: { lte: limit }, warehouseStockId: { not: null } },
          include: { material: { include: { category: true } }, warehouseStock: { include: { location: { include: { warehouse: true } } } } },
          orderBy: { expiryDate: "asc" },
        })
      : [];
  return { vehicleBatches, warehouseBatches };
}
