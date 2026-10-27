import type { IntervalUnit, Prisma } from "@prisma/client";
import { z, optDate, optDecimal, optId, optInt, optText, reqDate, reqText, checkbox } from "@/lib/validation";
import { addDays, addInterval, berlinToday, daysUntil } from "@/lib/format";
import { db } from "../db";
import type { Actor } from "../actor";
import { requirePermission } from "../actor";
import { assertVehicleAccess, viaVehicle } from "../access";
import { audit, diff } from "../audit";
import { conflict, invalid, notFound } from "../errors";
import { parse } from "../validate";
import { linkAttachments } from "./attachments";

const reminderDays = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v.map(Number);
    if (typeof v === "string") return v.split(/[,; ]+/).filter(Boolean).map(Number);
    return v;
  },
  z.array(z.number().int().min(0).max(365)).max(6, "Höchstens 6 Erinnerungszeitpunkte"),
);

const inspectionSchema = z
  .object({
    typeId: z.string().min(1, "Bitte Art der Prüfung wählen"),
    title: reqText(150),
    dueDate: reqDate(),
    lastDate: optDate(),
    intervalValue: optInt(1, 1000),
    intervalUnit: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["DAYS", "MONTHS", "YEARS"]).optional()),
    assignedToId: optId(),
    workshop: optText(200),
    estimatedCost: optDecimal(),
    remarks: optText(4000),
    reminderDays,
  })
  .refine((d) => (d.intervalValue == null) === (d.intervalUnit == null), { path: ["intervalUnit"], message: "Intervall und Einheit gemeinsam angeben" });

export type InspectionState = "overdue" | "due_soon" | "ok";

export function inspectionState(dueDate: Date, reminder: number[], now = new Date()): { state: InspectionState; days: number } {
  const days = daysUntil(dueDate, now)!;
  const maxReminder = Math.max(0, ...reminder);
  return { state: days < 0 ? "overdue" : days <= maxReminder ? "due_soon" : "ok", days };
}

export async function listInspections(actor: Actor, filter: { vehicleId?: string; state?: string; typeId?: string; includeInactive?: boolean } = {}) {
  requirePermission(actor, "inspections.view");
  const where: Prisma.InspectionWhereInput = { ...viaVehicle(actor), ...(filter.includeInactive ? {} : { active: true }) };
  if (filter.vehicleId) where.vehicleId = filter.vehicleId;
  if (filter.typeId) where.typeId = filter.typeId;
  const rows = await db.inspection.findMany({
    where,
    include: {
      vehicle: { select: { id: true, name: true, licensePlate: true } },
      type: true,
      assignedTo: { select: { firstName: true, lastName: true } },
      _count: { select: { attachments: true, records: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  const withState = rows.map((r) => ({ ...r, ...inspectionState(r.dueDate, r.reminderDays) }));
  return filter.state ? withState.filter((r) => r.state === filter.state) : withState;
}

export async function getInspection(actor: Actor, id: string) {
  requirePermission(actor, "inspections.view");
  const i = await db.inspection.findFirst({
    where: { id, ...viaVehicle(actor) },
    include: {
      vehicle: true,
      type: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      attachments: { orderBy: { createdAt: "desc" } },
      records: { orderBy: { performedAt: "desc" }, include: { createdBy: { select: { firstName: true, lastName: true } }, attachments: true } },
    },
  });
  if (!i) throw notFound("Termin nicht gefunden oder kein Zugriff.");
  return { ...i, ...inspectionState(i.dueDate, i.reminderDays) };
}

export async function createInspection(actor: Actor, vehicleId: string, input: unknown, attachmentIds: string[] = []) {
  requirePermission(actor, "inspections.manage");
  await assertVehicleAccess(actor, vehicleId, db, false);
  const d = parse(inspectionSchema, input);
  if (!(await db.inspectionType.findUnique({ where: { id: d.typeId } }))) throw invalid("Prüfungsart ungültig", { typeId: "Ungültig" });
  return db.$transaction(async (tx) => {
    const i = await tx.inspection.create({ data: { ...d, intervalUnit: d.intervalUnit as IntervalUnit | undefined, vehicleId } });
    await linkAttachments(tx, actor, attachmentIds, { inspectionId: i.id });
    await audit(actor, { action: "inspection.create", entityType: "Inspection", entityId: i.id, vehicleId, newValues: d }, tx);
    return i;
  });
}

export async function updateInspection(actor: Actor, id: string, input: unknown, attachmentIds: string[] = []) {
  requirePermission(actor, "inspections.manage");
  const before = await getInspection(actor, id);
  const d = parse(inspectionSchema, input);
  const data = {
    ...d,
    intervalUnit: (d.intervalUnit as IntervalUnit | undefined) ?? null,
    intervalValue: d.intervalValue ?? null,
    lastDate: d.lastDate ?? null,
    assignedToId: d.assignedToId ?? null,
    workshop: d.workshop ?? null,
    remarks: d.remarks ?? null,
    estimatedCost: d.estimatedCost ?? null,
  };
  const { oldValues, newValues } = diff(
    { ...before, estimatedCost: before.estimatedCost ? Number(before.estimatedCost) : null } as unknown as Record<string, unknown>,
    data as Record<string, unknown>,
  );
  await db.$transaction(async (tx) => {
    await tx.inspection.update({ where: { id }, data });
    await linkAttachments(tx, actor, attachmentIds, { inspectionId: id });
    await audit(actor, { action: "inspection.update", entityType: "Inspection", entityId: id, vehicleId: before.vehicleId, oldValues, newValues }, tx);
  });
}

export async function deactivateInspection(actor: Actor, id: string) {
  requirePermission(actor, "inspections.manage");
  const i = await getInspection(actor, id);
  await db.$transaction(async (tx) => {
    await tx.inspection.update({ where: { id }, data: { active: false } });
    await audit(actor, { action: "inspection.deactivate", entityType: "Inspection", entityId: id, vehicleId: i.vehicleId, oldValues: { active: true } }, tx);
  });
}

const completeSchema = z.object({
  performedAt: reqDate(),
  performedBy: optText(150),
  workshop: optText(200),
  cost: optDecimal(),
  mileage: optInt(0, 5_000_000),
  passed: checkbox(),
  remarks: optText(4000),
  nextDueDate: optDate(),
});

/**
 * Dokumentiert die Durchführung. Der nächste Termin ergibt sich aus dem konfigurierten Intervall
 * (oder manuell). Ohne Intervall und ohne Folgetermin wird der Termin deaktiviert.
 */
export async function completeInspection(actor: Actor, id: string, input: unknown, attachmentIds: string[] = []) {
  requirePermission(actor, "inspections.complete");
  const i = await getInspection(actor, id);
  if (!i.active) throw conflict("Der Termin ist nicht mehr aktiv.");
  const d = parse(completeSchema, input);
  if (d.performedAt.getTime() > addDays(berlinToday(), 1).getTime()) throw invalid("Durchführungsdatum liegt in der Zukunft", { performedAt: "Datum in der Zukunft" });
  const nextDue =
    d.nextDueDate ?? (i.intervalValue && i.intervalUnit ? addInterval(d.performedAt, i.intervalValue, i.intervalUnit) : null);
  if (!d.passed && !d.nextDueDate && !d.remarks) {
    throw invalid("Bei nicht bestandener Prüfung bitte Bemerkung und ggf. Nachprüftermin angeben.", { remarks: "Bemerkung erforderlich" });
  }
  return db.$transaction(async (tx) => {
    const rec = await tx.maintenanceRecord.create({
      data: {
        vehicleId: i.vehicleId,
        inspectionId: i.id,
        title: i.title,
        performedAt: d.performedAt,
        performedBy: d.performedBy,
        workshop: d.workshop ?? i.workshop,
        cost: d.cost,
        mileage: d.mileage,
        passed: d.passed,
        remarks: d.remarks,
        createdById: actor.id,
      },
    });
    await linkAttachments(tx, actor, attachmentIds, { maintenanceRecordId: rec.id });
    await tx.inspection.update({
      where: { id },
      data: nextDue ? { lastDate: d.performedAt, dueDate: nextDue } : { lastDate: d.performedAt, active: false },
    });
    if (d.mileage && (!i.vehicle.mileage || d.mileage > i.vehicle.mileage)) await tx.vehicle.update({ where: { id: i.vehicleId }, data: { mileage: d.mileage } });
    await audit(
      actor,
      { action: "inspection.complete", entityType: "Inspection", entityId: id, vehicleId: i.vehicleId, oldValues: { dueDate: i.dueDate, lastDate: i.lastDate }, newValues: { performedAt: d.performedAt, passed: d.passed, nextDueDate: nextDue } },
      tx,
    );
    return rec;
  });
}

// ───────────── Prüfungsarten ─────────────

const TYPE_ORDER = ["HU", "SP"]; // TÜV-Prüfungen zuerst

export async function listInspectionTypes(includeArchived = false) {
  const types = await db.inspectionType.findMany({ where: includeArchived ? {} : { archived: false }, orderBy: { name: "asc" } });
  const rank = (key: string | null) => (key && TYPE_ORDER.includes(key) ? TYPE_ORDER.indexOf(key) : TYPE_ORDER.length);
  return types.sort((a, b) => rank(a.key) - rank(b.key));
}

export async function upsertInspectionType(actor: Actor, input: unknown) {
  requirePermission(actor, "settings.manage");
  const d = parse(
    z.object({
      id: optId(),
      name: reqText(80),
      description: optText(300),
      defaultIntervalValue: optInt(1, 1000),
      defaultIntervalUnit: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["DAYS", "MONTHS", "YEARS"]).optional()),
      defaultReminderDays: reminderDays,
      archived: checkbox(),
    }),
    input,
  );
  const dup = await db.inspectionType.findFirst({ where: { name: { equals: d.name, mode: "insensitive" }, ...(d.id ? { id: { not: d.id } } : {}) } });
  if (dup) throw invalid("Prüfungsart existiert bereits", { name: "Bereits vorhanden" });
  const data = { ...d, id: undefined, defaultIntervalUnit: (d.defaultIntervalUnit as IntervalUnit | undefined) ?? null, defaultIntervalValue: d.defaultIntervalValue ?? null };
  const t = d.id ? await db.inspectionType.update({ where: { id: d.id }, data }) : await db.inspectionType.create({ data });
  await audit(actor, { action: "master.update", entityType: "InspectionType", entityId: t.id, newValues: d });
  return t;
}
