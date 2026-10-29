import type { CheckMaterialStatus } from "@prisma/client";
import { z, checkbox, optText, reqDate, reqInt } from "@/lib/validation";
import { berlinToday, fmtDate } from "@/lib/format";
import { db, type Tx } from "../db";
import type { Actor } from "../actor";
import { can } from "../actor";
import { audit } from "../audit";
import { conflict, invalid } from "../errors";
import { getSettings } from "../settings";
import { materialVisibility } from "../material-visibility";
import { changeBatch, changeVehicleQuantity, createMovement, findOrCreateBatch, lockVehicleStock, syncRefillRequest } from "./stock-core";
import { createDefectTx } from "./defects";
import { buildTree, flattenTree } from "./compartments";

/**
 * Materialprüfung im Rahmen der Fahrzeugkontrolle: Jede Beladungsposition wird Fach für Fach geprüft.
 * Abweichungen werden als Bestandskorrektur gebucht, abgelaufene Chargen als „abgelaufen“ ausgetragen,
 * Fehlmengen landen automatisch auf der Nachfüllliste, defekte Geräte werden als Mangel gemeldet.
 */

/** Beladung eines Fahrzeugs für die Kontrolle (nur für den Benutzer sichtbare Positionen). */
export async function materialsForCheck(actor: Actor, vehicleId: string) {
  const settings = await getSettings();
  const [stocks, hiddenNarcotics] = await Promise.all([
    db.vehicleMaterialStock.findMany({
      where: { vehicleId, active: true, material: materialVisibility(actor, settings.medicationsEnabled) },
      include: {
        material: { include: { category: true } },
        batches: { where: { quantity: { gt: 0 } }, orderBy: [{ expiryDate: "asc" }] },
        compartmentRef: { include: { parent: true } },
      },
      orderBy: [{ material: { category: { sortOrder: "asc" } } }, { material: { name: "asc" } }],
    }),
    can(actor, "materials.btm")
      ? Promise.resolve(0)
      : db.vehicleMaterialStock.count({ where: { vehicleId, active: true, material: { isNarcotic: true } } }),
  ]);
  // Reihenfolge wie im Fahrzeug (Schrank für Schrank, Fach für Fach, auch verschachtelt) und Ortshinweise
  const { roots, byId } = buildTree(await db.vehicleCompartment.findMany({ where: { vehicleId } }));
  const order = new Map(flattenTree(roots).map((n, i) => [n.id, i]));
  const hintOf = (id: string | null) => {
    const n = id ? byId.get(id) : undefined;
    if (!n) return null;
    const lines = [...n.ancestors.filter((a) => a.description).map((a) => `${a.name}: ${a.description}`), ...(n.description ? [n.description] : [])];
    return lines.join("\n") || null;
  };
  const sorted = stocks
    .map((s) => ({ ...s, locationHint: hintOf(s.compartmentId) }))
    .sort((a, b) => (order.get(a.compartmentId ?? "") ?? Number.MAX_SAFE_INTEGER) - (order.get(b.compartmentId ?? "") ?? Number.MAX_SAFE_INTEGER));
  return { stocks: sorted, hiddenNarcotics, expiryWarningDays: settings.expiryWarningDays };
}

export const CHECK_MATERIAL_STATUSES = ["OK", "DEVIATION", "DEFECT"] as const;

export const materialResultSchema = z.object({
  stockId: z.string().min(1),
  status: z.enum(CHECK_MATERIAL_STATUSES, { errorMap: () => ({ message: "Bitte Ergebnis wählen" }) }),
  // gezählte Gesamtmenge (Material ohne Verfallsdatum)
  counted: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(0).max(100000).optional()),
  // gezählte Menge je vorhandenem Verfallsdatum
  batches: z
    .array(z.object({ batchId: z.string().min(1), counted: reqInt(0, 100000), expiredRemoved: checkbox().optional() }))
    .max(200)
    .optional(),
  // zusätzlich vorgefundene Stücke mit (anderem) Verfallsdatum
  newBatches: z.array(z.object({ expiryDate: reqDate(), batchNumber: optText(80), quantity: reqInt(1, 100000) })).max(50).optional(),
  note: optText(1000),
});
export type MaterialResultInput = z.infer<typeof materialResultSchema>;

/** Prüft vor dem Speichern, ob alle (zum Zeitpunkt des Öffnens vorhandenen) Positionen bewertet wurden. */
export async function validateMaterialResults(actor: Actor, vehicleId: string, results: MaterialResultInput[], loadedAt: Date | undefined) {
  const { stocks } = await materialsForCheck(actor, vehicleId);
  const byId = new Map(stocks.map((s) => [s.id, s]));
  const answered = new Set(results.map((r) => r.stockId));
  const fe: Record<string, string> = {};
  for (const r of results) {
    if (!byId.has(r.stockId)) throw conflict("Die Beladung wurde zwischenzeitlich geändert. Bitte die Kontrolle neu öffnen.");
    const s = byId.get(r.stockId)!;
    if (r.status === "DEFECT" && !s.material.isEquipment) fe[`mat_${r.stockId}`] = "„Defekt“ nur bei Geräten";
    if (r.status === "DEFECT" && !r.note) fe[`matnote_${r.stockId}`] = "Bitte den Defekt beschreiben";
    if (s.material.isNarcotic) for (const nb of r.newBatches ?? []) if (!nb.batchNumber) fe[`mat_${r.stockId}`] = "Chargennummer ist bei BtM Pflicht";
    // Gebuchte Stücke ohne Verfallsdatum (MHD): müssen bei dieser Kontrolle mit MHD neu erfasst werden
    const undated = s.material.batchTracked ? s.batches.filter((b) => !b.expiryDate) : [];
    if (undated.length) {
      const qty = undated.reduce((n, b) => n + b.quantity, 0);
      const replaced = r.status === "DEVIATION" && undated.every((b) => r.batches?.some((rb) => rb.batchId === b.id && rb.counted === 0));
      if (!replaced) fe[`mat_${r.stockId}`] = `Bitte das Verfallsdatum (MHD) für ${qty} ${s.material.unit} angeben.`;
    }
    // „Vollständig“ bei Material mit Verfallsdatum, aber zu wenig gebucht: Verfallsdatum der übrigen Stücke ist unbekannt
    if (r.status === "OK" && s.material.batchTracked && s.currentQuantity < s.targetQuantity)
      fe[`mat_${r.stockId}`] = `Gebucht sind erst ${s.currentQuantity} von ${s.targetQuantity}. Bitte unter „Abweichung“ das Verfallsdatum der übrigen Stücke eintragen.`;
  }
  // Positionen, die erst nach dem Öffnen der Kontrolle angelegt wurden, müssen nicht bewertet sein
  const missing = stocks.filter((s) => !answered.has(s.id) && (!loadedAt || s.createdAt <= loadedAt));
  for (const m of missing) fe[`mat_${m.id}`] = "Bitte prüfen";
  if (missing.length) throw invalid(`Es fehlen Ergebnisse für ${missing.length} Materialposition(en).`, fe);
  if (Object.keys(fe).length) throw invalid("Bitte die markierten Materialpositionen prüfen.", fe);
  return byId;
}

/** Bucht die Materialprüfung innerhalb der Kontroll-Transaktion. */
export async function applyMaterialResults(
  tx: Tx,
  actor: Actor,
  ctx: { vehicleId: string; checkId: string; performedAt: Date; mileage?: number },
  results: MaterialResultInput[],
) {
  const today = berlinToday();
  const stamp = `Fahrzeugkontrolle ${fmtDate(ctx.performedAt)}`;
  let deviations = 0;
  let expiredRemovedTotal = 0;
  const defectIds: string[] = [];
  // feste Sperrreihenfolge verhindert Deadlocks mit parallelen Buchungen
  const ordered = [...results].sort((a, b) => a.stockId.localeCompare(b.stockId));
  const sortIndex = new Map(results.map((r, i) => [r.stockId, i]));

  for (const r of ordered) {
    const stock = await lockVehicleStock(tx, r.stockId);
    if (stock.vehicleId !== ctx.vehicleId) throw conflict("Materialposition gehört nicht zu diesem Fahrzeug.");
    if (!stock.active) continue; // zwischenzeitlich entfernt – nichts zu buchen
    if (stock.material.isNarcotic && !can(actor, "materials.btm")) throw conflict("Keine Berechtigung für Betäubungsmittel.");
    const previous = stock.currentQuantity;
    let expiredRemoved = 0;

    if (r.status === "OK" && previous < stock.targetQuantity) {
      // „Vollständig“ = Soll-Menge ist vorhanden → fehlende Buchung (z. B. Ersteinrichtung) nachholen
      if (stock.material.batchTracked)
        throw invalid(`${stock.material.name}: Gebucht sind erst ${previous} von ${stock.targetQuantity}. Bitte unter „Abweichung“ das Verfallsdatum der übrigen Stücke eintragen.`, { [`mat_${stock.id}`]: "Verfallsdatum fehlt" });
      const delta = stock.targetQuantity - previous;
      await changeVehicleQuantity(tx, stock.id, delta);
      await createMovement(tx, actor, { type: "CORRECTION", materialId: stock.materialId, quantity: delta, toVehicleStockId: stock.id, note: `${stamp}: vollständig (Soll ${stock.targetQuantity}) bestätigt` });
    }

    if (r.status === "DEVIATION") {
      if (stock.material.batchTracked) {
        const batches = await tx.materialBatch.findMany({ where: { vehicleStockId: stock.id } });
        const byId = new Map(batches.map((b) => [b.id, b]));
        for (const rb of r.batches ?? []) {
          const b = byId.get(rb.batchId);
          if (!b || b.quantity === 0) continue; // bereits anderweitig gebucht
          const expired = Boolean(b.expiryDate && b.expiryDate < today);
          if (rb.expiredRemoved && expired) {
            await changeBatch(tx, b.id, -b.quantity);
            await changeVehicleQuantity(tx, stock.id, -b.quantity);
            await createMovement(tx, actor, {
              type: "WRITE_OFF",
              reason: "EXPIRED",
              materialId: stock.materialId,
              quantity: -b.quantity,
              fromVehicleStockId: stock.id,
              batchId: b.id,
              batchNumber: b.batchNumber,
              expiryDate: b.expiryDate,
              note: `${stamp}: abgelaufen entnommen`,
            });
            expiredRemoved += b.quantity;
            continue;
          }
          const delta = rb.counted - b.quantity;
          if (delta === 0) continue;
          await changeBatch(tx, b.id, delta);
          await changeVehicleQuantity(tx, stock.id, delta);
          await createMovement(tx, actor, {
            type: "CORRECTION",
            materialId: stock.materialId,
            quantity: delta,
            ...(delta > 0 ? { toVehicleStockId: stock.id } : { fromVehicleStockId: stock.id }),
            batchId: b.id,
            batchNumber: b.batchNumber,
            expiryDate: b.expiryDate,
            note: `${stamp}: gezählt ${rb.counted} statt ${b.quantity}`,
          });
        }
        for (const nb of r.newBatches ?? []) {
          const b = await findOrCreateBatch(tx, { vehicleStockId: stock.id }, stock.materialId, nb.batchNumber, nb.expiryDate);
          await changeBatch(tx, b.id, nb.quantity);
          await changeVehicleQuantity(tx, stock.id, nb.quantity);
          await createMovement(tx, actor, {
            type: "CORRECTION",
            materialId: stock.materialId,
            quantity: nb.quantity,
            toVehicleStockId: stock.id,
            batchId: b.id,
            batchNumber: b.batchNumber,
            expiryDate: b.expiryDate,
            note: `${stamp}: vorgefunden und erfasst`,
          });
        }
      } else if (r.counted !== undefined && r.counted !== previous) {
        const delta = r.counted - previous;
        await changeVehicleQuantity(tx, stock.id, delta);
        await createMovement(tx, actor, {
          type: "CORRECTION",
          materialId: stock.materialId,
          quantity: delta,
          ...(delta > 0 ? { toVehicleStockId: stock.id } : { fromVehicleStockId: stock.id }),
          note: `${stamp}: gezählt ${r.counted} statt ${previous}`,
        });
      }
    }

    const after = await tx.vehicleMaterialStock.update({ where: { id: stock.id }, data: { lastCheckedAt: ctx.performedAt } });
    let status: CheckMaterialStatus = r.status === "DEFECT" ? "DEFECT" : r.status === "OK" ? "OK" : after.currentQuantity !== previous || expiredRemoved ? "DEVIATION" : "OK";
    if (status === "DEVIATION" && stock.material.isEquipment && after.currentQuantity === 0) status = "MISSING";
    if (status !== "OK") deviations++;
    expiredRemovedTotal += expiredRemoved;

    await tx.vehicleCheckMaterialResult.create({
      data: {
        checkId: ctx.checkId,
        vehicleStockId: stock.id,
        materialName: stock.material.name,
        compartment: stock.compartment,
        unit: stock.material.unit,
        isEquipment: stock.material.isEquipment,
        isNarcotic: stock.material.isNarcotic,
        targetQuantity: stock.targetQuantity,
        previousQuantity: previous,
        countedQuantity: after.currentQuantity,
        expiredRemoved,
        status,
        note: r.note,
        sortOrder: sortIndex.get(r.stockId) ?? 0,
      },
    });

    // Nachfüllliste nach jeder Prüfung mit dem festgestellten Bestand abgleichen (auch bei „Stimmt“)
    await syncRefillRequest(tx, actor, stock.id, stamp);

    if (status === "DEFECT") {
      const { defect } = await createDefectTx(
        tx,
        actor,
        {
          vehicleId: ctx.vehicleId,
          title: `${stock.material.name} defekt`,
          description: r.note || `Bei der Kontrolle als defekt gemeldet${stock.compartment ? ` (${stock.compartment})` : ""}.`,
          category: stock.material.category.isMedication ? "MEDICAL_DEVICES" : "EQUIPMENT",
          severity: "MEDIUM",
          mileage: ctx.mileage,
          affectsReadiness: false,
        },
        { vehicleCheckId: ctx.checkId, checkItemLabel: `Material: ${stock.material.name}` },
      );
      defectIds.push(defect.id);
    }
  }

  if (results.length) {
    await audit(
      actor,
      { action: "check.materials", entityType: "VehicleCheck", entityId: ctx.checkId, vehicleId: ctx.vehicleId, newValues: { positions: results.length, deviations, expiredRemoved: expiredRemovedTotal, defects: defectIds.length } },
      tx,
    );
  }
  return { deviations, defectIds };
}
