import { createHash, randomBytes } from "node:crypto";
import { z, optText, reqDate, reqText } from "@/lib/validation";
import { berlinToday, addDays, fmtDate } from "@/lib/format";
import { db, type Tx } from "../db";
import type { Actor } from "../actor";
import { requirePermission } from "../actor";
import { assertVehicleAccess } from "../access";
import { audit } from "../audit";
import { conflict, invalid, notFound } from "../errors";
import { notify, recipientsFor } from "../notifications";
import { getSettings } from "../settings";
import { parse } from "../validate";
import { changeBatch, changeVehicleQuantity, createMovement, lockVehicleStock, syncRefillRequest } from "./stock-core";
import { buildTree, flattenTree, pathLabel } from "./compartments";

/**
 * TESTFUNKTION „Verbrauch per QR-Code melden“ (standardmäßig aus, Einstellungen → qrConsumptionEnabled).
 * Jedes Fahrzeug hat einen geheimen Link (als QR-Code z. B. in der Fahrzeugmappe). Wer ihn öffnet, kann ohne
 * Anmeldung verbrauchtes Material melden; es wird als „verbraucht“ ausgetragen und landet auf der Nachfüllliste.
 * Schutz: geheimer, jederzeit erneuerbarer Link, keine Bestände sichtbar, BtM ausgeschlossen, Mengen begrenzt,
 * Ratenbegrenzung, Pflichtangabe Name, vollständige Protokollierung.
 */

export const OCCASIONS = ["Einsatz", "Sanitätsdienst", "Veranstaltung", "Übung", "Sonstiges"] as const;

async function assertEnabled() {
  if (!(await getSettings()).qrConsumptionEnabled) throw notFound("Diese Funktion ist nicht aktiviert.");
}

/** Technischer Benutzer, unter dem QR-Meldungen gebucht werden (kann sich nicht anmelden). */
async function systemActor(tx: Tx): Promise<Actor> {
  const role = await tx.role.findUniqueOrThrow({ where: { key: "USER" } });
  const u = await tx.user.upsert({
    where: { username: "system.qr-meldung" },
    create: { username: "system.qr-meldung", email: "qr-meldung@system.invalid", firstName: "QR-Meldung", lastName: "(ohne Login)", passwordHash: "!", roleId: role.id, status: "DISABLED", termsAcceptedAt: new Date() },
    update: {},
  });
  return { id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, email: u.email, status: "ACTIVE", roleKey: "SYSTEM", roleName: "System", permissions: new Set(), canPerformChecks: false };
}

const newToken = () => randomBytes(18).toString("base64url");

/** QR-Link eines Fahrzeugs (wird beim ersten Abruf erzeugt). */
export async function consumptionLink(actor: Actor, vehicleId: string, regenerate = false) {
  requirePermission(actor, "materials.manage");
  await assertEnabled();
  const v = await assertVehicleAccess(actor, vehicleId, db, false);
  if (v.consumptionToken && !regenerate) return v.consumptionToken;
  const token = newToken();
  await db.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { consumptionToken: token } });
    await audit(actor, { action: regenerate ? "consumption.token_renew" : "consumption.token_create", entityType: "Vehicle", entityId: vehicleId, vehicleId }, tx);
  });
  return token;
}

/** Öffentliche Ansicht: nur Fahrzeugname und Materialnamen je Fach – keine Bestände, keine BtM. */
export async function publicConsumptionForm(token: string) {
  await assertEnabled();
  const settings = await getSettings();
  const v = await db.vehicle.findFirst({ where: { consumptionToken: token, archivedAt: null } });
  if (!v) throw notFound("Dieser QR-Code ist ungültig oder wurde erneuert.");
  const stocks = await db.vehicleMaterialStock.findMany({
    where: { vehicleId: v.id, active: true, material: { isNarcotic: false, isEquipment: false, ...(settings.medicationsEnabled ? {} : { category: { isMedication: false } }) } },
    include: { material: true },
    orderBy: { material: { name: "asc" } },
  });
  const { roots, byId } = buildTree(await db.vehicleCompartment.findMany({ where: { vehicleId: v.id } }));
  const order = new Map(flattenTree(roots).map((n, i) => [n.id, i]));
  return {
    vehicle: { name: v.name, plate: v.licensePlate, callSign: v.radioCallSign },
    items: stocks
      .map((s) => ({
        stockId: s.id,
        name: s.material.name,
        unit: s.material.unit,
        location: s.compartmentId && byId.get(s.compartmentId) ? pathLabel(byId.get(s.compartmentId)!) : "Ohne Lagerort",
        order: order.get(s.compartmentId ?? "") ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.order - b.order),
  };
}

const reportSchema = z.object({
  occasion: z.enum(OCCASIONS, { errorMap: () => ({ message: "Bitte Anlass wählen" }) }),
  occurredOn: reqDate(),
  reporterName: reqText(80),
  note: optText(500),
  items: z
    .array(z.object({ stockId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(200) }))
    .min(1, "Bitte mindestens ein Material angeben")
    .max(100),
  website: z.string().max(0).optional(), // Honigtopf-Feld gegen Bots
});

// einfache Ratenbegrenzung je Link und Absender (Prozess-Speicher)
const hits = new Map<string, number[]>();
function rateLimit(key: string, max = 6, windowMs = 10 * 60_000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw conflict("Zu viele Meldungen in kurzer Zeit. Bitte später erneut versuchen.");
  list.push(now);
  hits.set(key, list);
}

/** Verbrauch melden (ohne Login): Material wird als „verbraucht“ ausgetragen, Nachfüllliste aktualisiert. */
export async function submitPublicConsumption(token: string, input: unknown, ip?: string | null) {
  await assertEnabled();
  const v = await db.vehicle.findFirst({ where: { consumptionToken: token, archivedAt: null } });
  if (!v) throw notFound("Dieser QR-Code ist ungültig oder wurde erneuert.");
  const d = parse(reportSchema, input);
  const today = berlinToday();
  if (d.occurredOn > today || d.occurredOn < addDays(today, -14)) throw invalid("Datum bitte innerhalb der letzten 14 Tage wählen.", { occurredOn: "Ungültiges Datum" });
  const ipHash = ip ? createHash("sha256").update(`${ip}|${token}`).digest("hex").slice(0, 32) : null;
  rateLimit(`${token}|${ipHash ?? "?"}`);

  // gleiche Position mehrfach → zusammenfassen
  const wanted = new Map<string, number>();
  for (const it of d.items) wanted.set(it.stockId, Math.min(200, (wanted.get(it.stockId) ?? 0) + it.quantity));

  return db.$transaction(
    async (tx) => {
      const actor = { ...(await systemActor(tx)), ip: ipHash };
      const stamp = `QR-Meldung ${d.occasion} ${fmtDate(d.occurredOn)} (${d.reporterName})`;
      const lines: { material: string; compartment: string | null; unit: string; reported: number; booked: number }[] = [];
      for (const stockId of [...wanted.keys()].sort()) {
        const stock = await lockVehicleStock(tx, stockId);
        if (stock.vehicleId !== v.id || !stock.active || stock.material.isNarcotic || stock.material.isEquipment) throw invalid("Ungültige Materialposition.");
        const reported = wanted.get(stockId)!;
        let rest = Math.min(reported, stock.currentQuantity);
        const booked = rest;
        if (stock.material.batchTracked) {
          // zuerst die am frühesten ablaufenden Stücke
          const batches = await tx.materialBatch.findMany({ where: { vehicleStockId: stock.id, quantity: { gt: 0 } }, orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }] });
          for (const b of batches) {
            if (!rest) break;
            const q = Math.min(rest, b.quantity);
            await changeBatch(tx, b.id, -q);
            await changeVehicleQuantity(tx, stock.id, -q);
            await createMovement(tx, actor, { type: "WRITE_OFF", reason: "USED", materialId: stock.materialId, quantity: -q, fromVehicleStockId: stock.id, batchId: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate, occurredAt: d.occurredOn, note: stamp });
            rest -= q;
          }
        } else if (rest) {
          await changeVehicleQuantity(tx, stock.id, -rest);
          await createMovement(tx, actor, { type: "WRITE_OFF", reason: "USED", materialId: stock.materialId, quantity: -rest, fromVehicleStockId: stock.id, occurredAt: d.occurredOn, note: stamp });
        }
        await syncRefillRequest(tx, actor, stock.id, stamp);
        lines.push({ material: stock.material.name, compartment: stock.compartment, unit: stock.material.unit, reported, booked });
      }
      const report = await tx.consumptionReport.create({
        data: { vehicleId: v.id, occasion: d.occasion, occurredOn: d.occurredOn, reporterName: d.reporterName, note: d.note, items: lines, ipHash },
      });
      await audit(actor, { action: "consumption.report", entityType: "ConsumptionReport", entityId: report.id, vehicleId: v.id, newValues: { occasion: d.occasion, reporter: d.reporterName, positions: lines.length } }, tx);
      const r = await recipientsFor({ permission: "materials.manage", vehicleId: v.id }, tx);
      await notify(r, { type: "material_issue", title: `Verbrauch gemeldet: ${v.name}`, body: `${d.occasion} am ${fmtDate(d.occurredOn)} · ${lines.length} Position(en) · ${d.reporterName}`, link: "/nachfuellung", dedupeKey: `consumption:${report.id}` }, tx);
      return { report, lines, vehicleName: v.name };
    },
    { timeout: 30_000 },
  );
}

/** Letzte Meldungen eines Fahrzeugs (für KFZ-Wart). */
export async function listConsumptionReports(actor: Actor, vehicleId: string, take = 10) {
  requirePermission(actor, "materials.view");
  await assertVehicleAccess(actor, vehicleId);
  return db.consumptionReport.findMany({ where: { vehicleId }, orderBy: { createdAt: "desc" }, take });
}
