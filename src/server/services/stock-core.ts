import type { MovementReason, MovementType, Prisma } from "@prisma/client";
import { ACTIVE_REFILL_STATUSES } from "@/lib/labels";
import type { Tx } from "../db";
import type { Actor } from "../actor";
import { audit } from "../audit";
import { conflict, invalid, notFound } from "../errors";
import { notify, recipientsFor } from "../notifications";

/**
 * Zentrale Bestandslogik. Alle Bestandsänderungen laufen über diese Funktionen:
 *  1. Zeile per SELECT … FOR UPDATE sperren (verhindert verlorene Updates bei gleichzeitigen Buchungen)
 *  2. Menge prüfen und ändern
 *  3. unveränderliche Lagerbewegung (StockMovement) schreiben
 * Die Datenbank sichert zusätzlich per CHECK-Constraint, dass kein Bestand negativ wird.
 */

export async function lockVehicleStock(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "VehicleMaterialStock" WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw notFound("Materialposition nicht gefunden.");
  return tx.vehicleMaterialStock.findUniqueOrThrow({
    where: { id },
    include: { material: { include: { category: true } }, vehicle: true, refillLocation: { include: { warehouse: true } } },
  });
}

export async function lockWarehouseStock(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "WarehouseStock" WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw notFound("Lagerbestand nicht gefunden.");
  return tx.warehouseStock.findUniqueOrThrow({ where: { id }, include: { material: true, location: { include: { warehouse: true } } } });
}

export async function lockRefill(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "RefillRequest" WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw notFound("Nachfüllanforderung nicht gefunden.");
  return tx.refillRequest.findUniqueOrThrow({ where: { id }, include: { vehicle: true, material: true, movements: true } });
}

type MovementData = {
  type: MovementType;
  reason?: MovementReason | null;
  materialId: string;
  quantity: number;
  fromVehicleStockId?: string;
  toVehicleStockId?: string;
  fromWarehouseStockId?: string;
  toWarehouseStockId?: string;
  batchId?: string | null;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  occurredAt?: Date;
  note?: string | null;
  refillRequestId?: string;
  clientRef?: string;
};

export function createMovement(tx: Tx, actor: Actor, m: MovementData) {
  if (!Number.isInteger(m.quantity) || m.quantity === 0) throw new Error("Ungültige Bewegungsmenge");
  return tx.stockMovement.create({ data: { ...m, userId: actor.id } });
}

/** Menge in einer Charge buchen (delta > 0 Zugang, < 0 Abgang). */
export async function changeBatch(tx: Tx, batchId: string, delta: number) {
  if (delta < 0) {
    const res = await tx.materialBatch.updateMany({ where: { id: batchId, quantity: { gte: -delta } }, data: { quantity: { increment: delta } } });
    if (res.count !== 1) throw conflict("Mit diesem Verfallsdatum ist nicht mehr genügend Menge vorhanden. Bitte Ansicht aktualisieren.");
  } else {
    await tx.materialBatch.update({ where: { id: batchId }, data: { quantity: { increment: delta } } });
  }
}

export async function changeVehicleQuantity(tx: Tx, stockId: string, delta: number) {
  if (delta < 0) {
    const res = await tx.vehicleMaterialStock.updateMany({ where: { id: stockId, currentQuantity: { gte: -delta } }, data: { currentQuantity: { increment: delta } } });
    if (res.count !== 1) throw conflict("Der Bestand reicht für diese Buchung nicht aus. Bitte Ansicht aktualisieren.");
  } else {
    await tx.vehicleMaterialStock.update({ where: { id: stockId }, data: { currentQuantity: { increment: delta } } });
  }
}

export async function changeWarehouseQuantity(tx: Tx, stockId: string, delta: number) {
  if (delta < 0) {
    const res = await tx.warehouseStock.updateMany({ where: { id: stockId, quantity: { gte: -delta } }, data: { quantity: { increment: delta } } });
    if (res.count !== 1) throw conflict("Der Lagerbestand reicht für diese Buchung nicht aus.");
  } else {
    await tx.warehouseStock.update({ where: { id: stockId }, data: { quantity: { increment: delta } } });
  }
}

/** Charge in einem Bestand finden oder anlegen (gleiche Chargennummer + gleiches Verfallsdatum).
 *  Die Chargennummer ist optional – außer bei Betäubungsmitteln (BtM-Nachweis). */
export async function findOrCreateBatch(
  tx: Tx,
  holder: { vehicleStockId?: string; warehouseStockId?: string },
  materialId: string,
  batchNumber: string | null | undefined,
  expiryDate: Date | null | undefined,
) {
  batchNumber = batchNumber?.trim() || null;
  const material = await tx.material.findUniqueOrThrow({ where: { id: materialId }, select: { name: true, isNarcotic: true } });
  if (material.isNarcotic && !batchNumber)
    throw invalid(`Bei Betäubungsmitteln ist die Chargennummer Pflicht (${material.name}).`, { batchNumber: "Pflicht bei BtM" });
  const where: Prisma.MaterialBatchWhereInput = {
    materialId,
    vehicleStockId: holder.vehicleStockId ?? null,
    warehouseStockId: holder.warehouseStockId ?? null,
    batchNumber: batchNumber ?? null,
    expiryDate: expiryDate ?? null,
  };
  const existing = await tx.materialBatch.findFirst({ where });
  if (existing) return existing;
  return tx.materialBatch.create({
    data: { materialId, vehicleStockId: holder.vehicleStockId, warehouseStockId: holder.warehouseStockId, batchNumber: batchNumber ?? null, expiryDate: expiryDate ?? null, quantity: 0 },
  });
}

/**
 * Gleicht die Nachfüllanforderung eines Fahrzeugbestands mit dem tatsächlichen Bedarf ab.
 * Bedarf = Sollbestand − aktueller Bestand. Es existiert höchstens EINE aktive Anforderung
 * je Bestand (partieller Unique-Index) – dadurch werden Doppelmeldungen ausgeschlossen.
 * Muss innerhalb der Transaktion aufgerufen werden, die den Bestand gesperrt hat.
 */
export async function syncRefillRequest(tx: Tx, actor: Actor, stockId: string, reason: string) {
  const stock = await tx.vehicleMaterialStock.findUniqueOrThrow({
    where: { id: stockId },
    include: { material: true, vehicle: true },
  });
  const need = Math.max(0, stock.targetQuantity - stock.currentQuantity);
  const active = await tx.refillRequest.findFirst({ where: { vehicleStockId: stockId, status: { in: [...ACTIVE_REFILL_STATUSES] } } });

  if (!stock.active) return active;

  if (need === 0) {
    if (active && active.status === "OPEN") {
      await tx.refillRequest.update({ where: { id: active.id }, data: { status: "CANCELLED", closedAt: new Date(), notes: appendNote(active.notes, "Automatisch storniert: Sollbestand erreicht.") } });
      await audit(actor, { action: "refill.cancel", entityType: "RefillRequest", entityId: active.id, vehicleId: stock.vehicleId, oldValues: { status: "OPEN" }, newValues: { status: "CANCELLED", reason: "Sollbestand erreicht" } }, tx);
    }
    return null;
  }

  if (active) {
    if (active.requestedQuantity !== need) {
      await tx.refillRequest.update({ where: { id: active.id }, data: { requestedQuantity: need, notes: appendNote(active.notes, `Menge angepasst auf ${need} (${reason}).`) } });
      await audit(actor, { action: "refill.update_quantity", entityType: "RefillRequest", entityId: active.id, vehicleId: stock.vehicleId, oldValues: { requestedQuantity: active.requestedQuantity }, newValues: { requestedQuantity: need, reason } }, tx);
    }
    return active;
  }

  const req = await tx.refillRequest.create({
    data: {
      vehicleId: stock.vehicleId,
      vehicleStockId: stock.id,
      materialId: stock.materialId,
      requestedQuantity: need,
      reason,
      reportedById: actor.id,
    },
  });
  await audit(actor, { action: "refill.create", entityType: "RefillRequest", entityId: req.id, vehicleId: stock.vehicleId, newValues: { material: stock.material.name, requestedQuantity: need, reason } }, tx);
  const recipients = await recipientsFor({ permission: "refills.process", vehicleId: stock.vehicleId, excludeUserId: actor.id }, tx);
  await notify(
    recipients,
    {
      type: "refill_new",
      title: `Nachfüllbedarf: ${stock.vehicle.name}`,
      body: `${need} ${stock.material.unit} ${stock.material.name}`,
      link: `/nachfuellung?id=${req.id}`,
      dedupeKey: `refill:${req.id}`,
    },
    tx,
  );
  return req;
}

function appendNote(existing: string | null, line: string) {
  const stamp = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  return [existing, `[${stamp}] ${line}`].filter(Boolean).join("\n").slice(-4000);
}
export { appendNote };
