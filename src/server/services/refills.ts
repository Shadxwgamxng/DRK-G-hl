import type { Prisma, RefillStatus } from "@prisma/client";
import { z, optDate, optId, optText, reqInt } from "@/lib/validation";
import { ACTIVE_REFILL_STATUSES, REFILL_STATUS } from "@/lib/labels";
import { db } from "../db";
import type { Actor } from "../actor";
import { can, requirePermission } from "../actor";
import { viaVehicle } from "../access";
import { audit } from "../audit";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { notify, recipientsFor } from "../notifications";
import { parse } from "../validate";
import {
  appendNote,
  changeBatch,
  changeVehicleQuantity,
  changeWarehouseQuantity,
  createMovement,
  findOrCreateBatch,
  lockRefill,
  lockVehicleStock,
  lockWarehouseStock,
  syncRefillRequest,
} from "./stock-core";

export type RefillFilter = { status?: string; vehicleId?: string; q?: string; locationId?: string };

function canSeeRefills(actor: Actor) {
  return can(actor, "refills.process") || can(actor, "refills.confirm") || can(actor, "materials.view");
}

export async function listRefills(actor: Actor, f: RefillFilter = {}) {
  if (!canSeeRefills(actor)) throw forbidden();
  const where: Prisma.RefillRequestWhereInput = { ...viaVehicle(actor) };
  if (!f.status || f.status === "active") where.status = { in: [...ACTIVE_REFILL_STATUSES, "REFILLED"] };
  else if (f.status === "history") where.status = { in: ["DONE", "CANCELLED", "REFILLED"] };
  else if (f.status !== "all" && f.status in REFILL_STATUS) where.status = f.status as RefillStatus;
  if (f.vehicleId) where.vehicleId = f.vehicleId;
  if (f.q) where.material = { name: { contains: f.q, mode: "insensitive" } };
  if (f.locationId) where.vehicleStock = { refillLocationId: f.locationId };

  const rows = await db.refillRequest.findMany({
    where,
    include: {
      vehicle: { select: { id: true, name: true, licensePlate: true } },
      material: { include: { category: true } },
      vehicleStock: { include: { refillLocation: { include: { warehouse: true } } } },
      reportedBy: { select: { firstName: true, lastName: true } },
      providedBy: { select: { firstName: true, lastName: true } },
      confirmedBy: { select: { firstName: true, lastName: true } },
      movements: { orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });

  // Wo liegt das Material im Lager? (für das Lagerpersonal)
  const materialIds = [...new Set(rows.map((r) => r.materialId))];
  const warehouseStocks = can(actor, "warehouse.view") || can(actor, "refills.process")
    ? await db.warehouseStock.findMany({
        where: { materialId: { in: materialIds }, quantity: { gt: 0 } },
        include: { location: { include: { warehouse: true } }, batches: { where: { quantity: { gt: 0 } }, orderBy: { expiryDate: "asc" } } },
        orderBy: { location: { name: "asc" } },
      })
    : [];
  const statusOrder: Record<string, number> = { OPEN: 0, IN_PROGRESS: 1, PROVIDED: 2, REFILLED: 3, DONE: 4, CANCELLED: 5 };
  return rows
    .map((r) => ({ ...r, warehouseStocks: warehouseStocks.filter((w) => w.materialId === r.materialId) }))
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.createdAt.getTime() - a.createdAt.getTime());
}

async function loadVisible(actor: Actor, id: string) {
  const r = await db.refillRequest.findFirst({ where: { id, ...viaVehicle(actor) }, select: { id: true } });
  if (!r) throw notFound("Nachfüllanforderung nicht gefunden oder kein Zugriff.");
}

export async function startRefill(actor: Actor, id: string) {
  requirePermission(actor, "refills.process");
  await loadVisible(actor, id);
  await db.$transaction(async (tx) => {
    const r = await lockRefill(tx, id);
    if (r.status !== "OPEN") throw conflict("Nur offene Anforderungen können übernommen werden.");
    await tx.refillRequest.update({ where: { id }, data: { status: "IN_PROGRESS", notes: appendNote(r.notes, `In Bearbeitung durch ${actor.firstName} ${actor.lastName}`) } });
    await audit(actor, { action: "refill.status", entityType: "RefillRequest", entityId: id, vehicleId: r.vehicleId, oldValues: { status: r.status }, newValues: { status: "IN_PROGRESS" } }, tx);
  });
}

const provideSchema = z.object({
  items: z
    .array(z.object({ warehouseStockId: z.string().min(1), batchId: optId(), quantity: reqInt(1, 100000) }))
    .min(1, "Bitte mindestens einen Lagerplatz wählen"),
  note: optText(1000),
});

/** Lagerpersonal entnimmt Material aus dem zentralen Lager und stellt es für das Fahrzeug bereit. */
export async function provideRefill(actor: Actor, id: string, input: unknown) {
  requirePermission(actor, "refills.process");
  await loadVisible(actor, id);
  const d = parse(provideSchema, input);
  await db.$transaction(async (tx) => {
    const r = await lockRefill(tx, id);
    if (!["OPEN", "IN_PROGRESS", "PROVIDED"].includes(r.status)) throw conflict("Für diese Anforderung kann kein Material mehr bereitgestellt werden.");
    let total = 0;
    for (const item of d.items) {
      const ws = await lockWarehouseStock(tx, item.warehouseStockId);
      if (ws.materialId !== r.materialId) throw invalid("Lagerplatz enthält ein anderes Material.");
      let batch = null;
      if (r.material.batchTracked) {
        if (!item.batchId) throw invalid("Bitte das Verfallsdatum wählen.", { batchId: "Verfallsdatum erforderlich" });
        batch = await tx.materialBatch.findFirst({ where: { id: item.batchId, warehouseStockId: ws.id } });
        if (!batch) throw invalid("Diese Stücke gehören nicht zu diesem Lagerplatz.");
        if (batch.quantity < item.quantity) throw invalid(`Mit diesem Verfallsdatum sind nur ${batch.quantity} vorhanden.`);
        await changeBatch(tx, batch.id, -item.quantity);
      }
      if (ws.quantity < item.quantity) throw invalid(`Am Lagerplatz ${ws.location.name} sind nur ${ws.quantity} vorhanden.`);
      await changeWarehouseQuantity(tx, ws.id, -item.quantity);
      await createMovement(tx, actor, {
        type: "PROVISION",
        materialId: r.materialId,
        quantity: -item.quantity,
        fromWarehouseStockId: ws.id,
        batchId: batch?.id,
        batchNumber: batch?.batchNumber,
        expiryDate: batch?.expiryDate,
        refillRequestId: r.id,
        note: `Bereitgestellt für ${r.vehicle.name}${d.note ? ` – ${d.note}` : ""}`,
      });
      total += item.quantity;
    }
    const provided = (r.providedQuantity ?? 0) + total;
    await tx.refillRequest.update({
      where: { id },
      data: { status: "PROVIDED", providedQuantity: provided, providedById: actor.id, providedAt: new Date(), notes: d.note ? appendNote(r.notes, d.note) : r.notes },
    });
    await audit(actor, { action: "refill.provide", entityType: "RefillRequest", entityId: id, vehicleId: r.vehicleId, oldValues: { status: r.status, providedQuantity: r.providedQuantity }, newValues: { status: "PROVIDED", providedQuantity: provided } }, tx);
    const recipients = await recipientsFor({ permission: "refills.confirm", vehicleId: r.vehicleId, excludeUserId: actor.id }, tx);
    await notify(recipients, { type: "refill_provided", title: `Material bereitgestellt: ${r.vehicle.name}`, body: `${provided} ${r.material.unit} ${r.material.name}`, link: `/nachfuellung?id=${id}`, dedupeKey: `refill-provided:${id}:${provided}` }, tx);
  });
}

const confirmSchema = z.object({
  quantity: reqInt(1, 100000),
  batches: z
    .array(z.object({ batchNumber: optText(80), expiryDate: optDate(), quantity: reqInt(1, 100000) }))
    .optional(),
  note: optText(1000),
});

/**
 * Bestätigung der tatsächlich nachgefüllten Menge. ERST hier wird der Fahrzeugbestand erhöht.
 * Wurde Material aus dem Lager bereitgestellt, werden dessen Chargen übernommen; nicht verwendete
 * Mengen werden automatisch an den ursprünglichen Lagerplatz zurückgebucht.
 */
export async function confirmRefill(actor: Actor, id: string, input: unknown) {
  requirePermission(actor, "refills.confirm");
  await loadVisible(actor, id);
  const d = parse(confirmSchema, input);
  return db.$transaction(async (tx) => {
    // Sperrreihenfolge wie beim Austragen (erst Bestand, dann Anforderung) → keine Deadlocks
    const { vehicleStockId } = await tx.refillRequest.findUniqueOrThrow({ where: { id }, select: { vehicleStockId: true } });
    const stock = await lockVehicleStock(tx, vehicleStockId);
    const r = await lockRefill(tx, id);
    if (!(ACTIVE_REFILL_STATUSES as readonly string[]).includes(r.status)) throw conflict(`Anforderung ist bereits „${REFILL_STATUS[r.status]}“.`);
    const provisions = r.movements.filter((m) => m.type === "PROVISION");
    const returns = r.movements.filter((m) => m.type === "RETURN");
    if (returns.length) throw conflict("Bereitstellung wurde bereits zurückgebucht.");

    if (provisions.length > 0) {
      const provided = provisions.reduce((n, m) => n - m.quantity, 0);
      if (d.quantity > provided)
        throw invalid(`Es wurden nur ${provided} ${r.material.unit} bereitgestellt. Mehrmengen bitte separat erfassen.`, { quantity: `Maximal ${provided}` });
      // FEFO: zuerst die Chargen mit dem frühesten Verfallsdatum einräumen
      const sorted = [...provisions].sort((a, b) => (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity));
      let remaining = d.quantity;
      for (const p of sorted) {
        const available = -p.quantity;
        const take = Math.min(available, remaining);
        remaining -= take;
        if (take > 0) await bookIntoVehicle(tx, actor, stock, r.id, take, p.batchNumber, p.expiryDate, d.note);
        const leftover = available - take;
        if (leftover > 0) {
          await changeWarehouseQuantity(tx, p.fromWarehouseStockId!, leftover);
          if (p.batchId) await changeBatch(tx, p.batchId, leftover);
          await createMovement(tx, actor, {
            type: "RETURN",
            materialId: r.materialId,
            quantity: leftover,
            toWarehouseStockId: p.fromWarehouseStockId!,
            batchId: p.batchId,
            batchNumber: p.batchNumber,
            expiryDate: p.expiryDate,
            refillRequestId: r.id,
            note: "Nicht benötigte Bereitstellung zurückgebucht",
          });
        }
      }
    } else if (r.material.batchTracked) {
      const batches = d.batches ?? [];
      const sum = batches.reduce((n, b) => n + b.quantity, 0);
      if (batches.length === 0 || sum !== d.quantity)
        throw invalid("Bitte Chargennummer, Verfallsdatum und Menge der eingeräumten Chargen angeben (Summe = Nachfüllmenge).", { batches: "Chargenangaben unvollständig" });
      for (const b of batches) {
        if (!b.expiryDate) throw invalid("Bitte das Verfallsdatum angeben.", { batches: "Verfallsdatum fehlt" });
        await bookIntoVehicle(tx, actor, stock, r.id, b.quantity, b.batchNumber ?? null, b.expiryDate, d.note ?? "Nachfüllung ohne Lagerbereitstellung");
      }
    } else {
      await bookIntoVehicle(tx, actor, stock, r.id, d.quantity, null, null, d.note ?? "Nachfüllung ohne Lagerbereitstellung");
    }

    await tx.refillRequest.update({
      where: { id },
      data: { status: "REFILLED", refilledQuantity: d.quantity, confirmedById: actor.id, confirmedAt: new Date(), notes: d.note ? appendNote(r.notes, d.note) : r.notes },
    });
    await audit(
      actor,
      { action: "refill.confirm", entityType: "RefillRequest", entityId: id, vehicleId: r.vehicleId, oldValues: { status: r.status, currentQuantity: stock.currentQuantity }, newValues: { status: "REFILLED", refilledQuantity: d.quantity, currentQuantity: stock.currentQuantity + d.quantity } },
      tx,
    );
    // Restbedarf? → neue Anforderung (die bestätigte ist nicht mehr aktiv)
    const followUp = await syncRefillRequest(tx, actor, stock.id, "Restbedarf nach Nachfüllung");
    const recipients = new Set([r.reportedById, ...(await recipientsFor({ permission: "refills.process", vehicleId: r.vehicleId }, tx))]);
    recipients.delete(actor.id);
    await notify([...recipients], { type: "refill_done", title: `Nachgefüllt: ${r.vehicle.name}`, body: `${d.quantity} ${r.material.unit} ${r.material.name}`, link: `/nachfuellung?id=${id}`, dedupeKey: `refill-done:${id}` }, tx);
    return { followUp };
  });
}

async function bookIntoVehicle(
  tx: Prisma.TransactionClient,
  actor: Actor,
  stock: { id: string; materialId: string; material: { batchTracked: boolean } },
  refillId: string,
  qty: number,
  batchNumber: string | null,
  expiryDate: Date | null,
  note?: string | null,
) {
  let batchId: string | undefined;
  if (stock.material.batchTracked) {
    const b = await findOrCreateBatch(tx, { vehicleStockId: stock.id }, stock.materialId, batchNumber, expiryDate);
    await changeBatch(tx, b.id, qty);
    batchId = b.id;
  }
  await changeVehicleQuantity(tx, stock.id, qty);
  await createMovement(tx, actor, { type: "REFILL", materialId: stock.materialId, quantity: qty, toVehicleStockId: stock.id, batchId, batchNumber, expiryDate, refillRequestId: refillId, note });
}

export async function closeRefill(actor: Actor, id: string) {
  if (!can(actor, "refills.process") && !can(actor, "refills.confirm")) throw forbidden();
  await loadVisible(actor, id);
  await db.$transaction(async (tx) => {
    const r = await lockRefill(tx, id);
    if (r.status !== "REFILLED") throw conflict("Nur nachgefüllte Anforderungen können abgeschlossen werden.");
    await tx.refillRequest.update({ where: { id }, data: { status: "DONE", closedAt: new Date() } });
    await audit(actor, { action: "refill.status", entityType: "RefillRequest", entityId: id, vehicleId: r.vehicleId, oldValues: { status: "REFILLED" }, newValues: { status: "DONE" } }, tx);
  });
}

export async function cancelRefill(actor: Actor, id: string, reason: string) {
  requirePermission(actor, "refills.process");
  await loadVisible(actor, id);
  if (!reason?.trim()) throw invalid("Bitte einen Grund angeben.", { reason: "Pflichtfeld" });
  await db.$transaction(async (tx) => {
    const r = await lockRefill(tx, id);
    if (!(ACTIVE_REFILL_STATUSES as readonly string[]).includes(r.status)) throw conflict("Anforderung ist nicht mehr aktiv.");
    // Bereitgestelltes Material zurück ins Lager
    for (const p of r.movements.filter((m) => m.type === "PROVISION")) {
      await lockWarehouseStock(tx, p.fromWarehouseStockId!);
      await changeWarehouseQuantity(tx, p.fromWarehouseStockId!, -p.quantity);
      if (p.batchId) await changeBatch(tx, p.batchId, -p.quantity);
      await createMovement(tx, actor, { type: "RETURN", materialId: r.materialId, quantity: -p.quantity, toWarehouseStockId: p.fromWarehouseStockId!, batchId: p.batchId, batchNumber: p.batchNumber, expiryDate: p.expiryDate, refillRequestId: r.id, note: "Storno – Rückbuchung" });
    }
    await tx.refillRequest.update({ where: { id }, data: { status: "CANCELLED", closedAt: new Date(), notes: appendNote(r.notes, `Storniert: ${reason.trim()}`) } });
    await audit(actor, { action: "refill.cancel", entityType: "RefillRequest", entityId: id, vehicleId: r.vehicleId, oldValues: { status: r.status }, newValues: { status: "CANCELLED", reason } }, tx);
  });
}

export async function refillCounts(actor: Actor) {
  if (!canSeeRefills(actor)) return { open: 0 };
  const open = await db.refillRequest.count({ where: { ...viaVehicle(actor), status: { in: [...ACTIVE_REFILL_STATUSES] } } });
  return { open };
}
