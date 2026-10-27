import type { Prisma, VehicleStatus } from "@prisma/client";
import { z, optDate, optInt, optText, reqInt, reqText, optId } from "@/lib/validation";
import { addDays, berlinToday, daysUntil } from "@/lib/format";
import { OPEN_DEFECT_STATUSES } from "@/lib/labels";
import { db } from "../db";
import type { Actor } from "../actor";
import { can, requirePermission } from "../actor";
import { assertVehicleAccess, vehicleWhere } from "../access";
import { audit, diff } from "../audit";
import { conflict, invalid } from "../errors";
import { notify, recipientsFor } from "../notifications";
import { getSettings } from "../settings";
import { parse } from "../validate";
import { linkAttachments } from "./attachments";

export const VEHICLE_STATUSES = ["READY", "LIMITED", "NOT_READY", "OUT_OF_SERVICE"] as const;

const vehicleSchema = z.object({
  name: reqText(100),
  radioCallSign: optText(60),
  internalNumber: reqText(40),
  licensePlate: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, " ") : v), z.string().min(1).max(20)),
  typeId: z.string().min(1, "Bitte Fahrzeugtyp wählen"),
  manufacturer: optText(80),
  model: optText(80),
  buildYear: optInt(1950, 2100),
  firstRegistration: optDate(),
  mileage: optInt(0, 5_000_000),
  location: optText(120),
  responsibleUserId: optId(),
  remarks: optText(4000),
  checkIntervalDays: reqInt(1, 365),
});

export type VehicleSummary = Awaited<ReturnType<typeof summarizeVehicles>>[number];

/**
 * Übersichtsdaten je Fahrzeug – alle Kennzahlen werden aus den tatsächlichen Daten berechnet.
 */
export async function summarizeVehicles(actor: Actor, opts: { where?: Prisma.VehicleWhereInput; includeArchived?: boolean } = {}) {
  const settings = await getSettings();
  const today = berlinToday();
  const expiryLimit = addDays(today, settings.expiryWarningDays);
  const vehicles = await db.vehicle.findMany({
    where: { AND: [vehicleWhere(actor, opts.includeArchived), opts.where ?? {}] },
    include: {
      type: true,
      responsibleUser: { select: { id: true, firstName: true, lastName: true } },
      checks: { orderBy: { performedAt: "desc" }, take: 1, include: { performedBy: { select: { firstName: true, lastName: true } } } },
      inspections: { where: { active: true }, orderBy: { dueDate: "asc" }, include: { type: true } },
    },
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
  });
  const ids = vehicles.map((v) => v.id);
  if (ids.length === 0) return [];

  const [defectGroups, criticalGroups, stocks, batchRows] = await Promise.all([
    db.defect.groupBy({ by: ["vehicleId"], where: { vehicleId: { in: ids }, status: { in: [...OPEN_DEFECT_STATUSES] } }, _count: true }),
    db.defect.groupBy({ by: ["vehicleId"], where: { vehicleId: { in: ids }, status: { in: [...OPEN_DEFECT_STATUSES] }, severity: "CRITICAL" }, _count: true }),
    db.vehicleMaterialStock.findMany({ where: { vehicleId: { in: ids }, active: true }, select: { vehicleId: true, currentQuantity: true, targetQuantity: true } }),
    db.materialBatch.findMany({
      where: { vehicleStock: { vehicleId: { in: ids }, active: true }, quantity: { gt: 0 }, expiryDate: { lte: expiryLimit } },
      select: { expiryDate: true, vehicleStock: { select: { vehicleId: true } } },
    }),
  ]);

  return vehicles.map((v) => {
    const lastCheck = v.checks[0] ?? null;
    const nextCheckDue = lastCheck ? addDays(berlinToday(lastCheck.performedAt), v.checkIntervalDays) : null;
    const hu = v.inspections.find((i) => i.type.key === "HU") ?? null;
    const nextMaintenance = v.inspections.find((i) => i.type.key !== "HU") ?? null;
    const vStocks = stocks.filter((s) => s.vehicleId === v.id);
    const vBatches = batchRows.filter((b) => b.vehicleStock?.vehicleId === v.id);
    return {
      ...v,
      lastCheck,
      nextCheckDue,
      nextCheckInDays: lastCheck ? daysUntil(nextCheckDue) : null,
      nextHu: hu,
      nextMaintenance,
      openDefects: defectGroups.find((g) => g.vehicleId === v.id)?._count ?? 0,
      criticalDefects: criticalGroups.find((g) => g.vehicleId === v.id)?._count ?? 0,
      missingMaterials: vStocks.filter((s) => s.currentQuantity < s.targetQuantity).length,
      expiredBatches: vBatches.filter((b) => b.expiryDate! < today).length,
      expiringBatches: vBatches.filter((b) => b.expiryDate! >= today).length,
    };
  });
}

export async function getVehicle(actor: Actor, vehicleId: string) {
  await assertVehicleAccess(actor, vehicleId);
  const [summary] = await summarizeVehicles(actor, { where: { id: vehicleId }, includeArchived: true });
  const details = await db.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    include: {
      assignments: { include: { user: { select: { id: true, firstName: true, lastName: true, username: true } } } },
      attachments: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { firstName: true, lastName: true } } } },
      statusChanges: { orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });
  return { ...summary, ...details, ...pickSummary(summary) };
}

function pickSummary(s: VehicleSummary) {
  const { lastCheck, nextCheckDue, nextCheckInDays, nextHu, nextMaintenance, openDefects, criticalDefects, missingMaterials, expiredBatches, expiringBatches } = s;
  return { lastCheck, nextCheckDue, nextCheckInDays, nextHu, nextMaintenance, openDefects, criticalDefects, missingMaterials, expiredBatches, expiringBatches };
}

async function validateRefs(d: z.infer<typeof vehicleSchema>) {
  const type = await db.vehicleType.findUnique({ where: { id: d.typeId } });
  if (!type || type.archived) throw invalid("Fahrzeugtyp ungültig", { typeId: "Fahrzeugtyp ungültig" });
  if (d.responsibleUserId) {
    const u = await db.user.findFirst({ where: { id: d.responsibleUserId, status: "ACTIVE" } });
    if (!u) throw invalid("Verantwortlicher ungültig", { responsibleUserId: "Benutzer nicht aktiv" });
  }
}

async function ensureUnique(d: { internalNumber: string; licensePlate: string }, exceptId?: string) {
  const dup = await db.vehicle.findFirst({
    where: { OR: [{ internalNumber: d.internalNumber }, { licensePlate: d.licensePlate }], ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (dup) {
    const fe: Record<string, string> = {};
    if (dup.internalNumber === d.internalNumber) fe.internalNumber = "Fahrzeugnummer bereits vergeben";
    if (dup.licensePlate === d.licensePlate) fe.licensePlate = "Kennzeichen bereits vergeben";
    throw invalid("Fahrzeug existiert bereits.", fe);
  }
}

export async function createVehicle(actor: Actor, input: unknown, imageAttachmentId?: string) {
  requirePermission(actor, "vehicles.manage");
  const d = parse(vehicleSchema, input);
  await validateRefs(d);
  await ensureUnique(d);
  return db.$transaction(async (tx) => {
    const v = await tx.vehicle.create({ data: { ...d, status: "READY" } });
    if (d.responsibleUserId) {
      await tx.vehicleAssignment.upsert({
        where: { userId_vehicleId: { userId: d.responsibleUserId, vehicleId: v.id } },
        create: { userId: d.responsibleUserId, vehicleId: v.id, assignedById: actor.id },
        update: {},
      });
    }
    if (imageAttachmentId) await setVehicleImageTx(tx, actor, v.id, imageAttachmentId);
    await audit(actor, { action: "vehicle.create", entityType: "Vehicle", entityId: v.id, vehicleId: v.id, newValues: d }, tx);
    return v;
  });
}

export async function updateVehicle(actor: Actor, vehicleId: string, input: unknown, imageAttachmentId?: string) {
  requirePermission(actor, "vehicles.manage");
  const before = await assertVehicleAccess(actor, vehicleId);
  const d = parse(vehicleSchema, input);
  await validateRefs(d);
  await ensureUnique(d, vehicleId);
  const { oldValues, newValues, changed } = diff(before as unknown as Record<string, unknown>, d);
  await db.$transaction(async (tx) => {
    if (changed) {
      await tx.vehicle.update({ where: { id: vehicleId }, data: d });
      await audit(actor, { action: "vehicle.update", entityType: "Vehicle", entityId: vehicleId, vehicleId, oldValues, newValues }, tx);
    }
    if (d.responsibleUserId && d.responsibleUserId !== before.responsibleUserId) {
      await tx.vehicleAssignment.upsert({
        where: { userId_vehicleId: { userId: d.responsibleUserId, vehicleId } },
        create: { userId: d.responsibleUserId, vehicleId, assignedById: actor.id },
        update: {},
      });
    }
    if (imageAttachmentId) await setVehicleImageTx(tx, actor, vehicleId, imageAttachmentId);
  });
}

async function setVehicleImageTx(tx: Prisma.TransactionClient, actor: Actor, vehicleId: string, attachmentId: string) {
  const a = await tx.attachment.findFirst({ where: { id: attachmentId, uploadedById: actor.id, kind: "PHOTO" } });
  if (!a) throw invalid("Fahrzeugbild ungültig");
  // Bild dem Fahrzeug zuordnen (Zugriffsprüfung über das Fahrzeug)
  if (!a.vehicleId) await tx.attachment.update({ where: { id: a.id }, data: { vehicleId } });
  await tx.vehicle.update({ where: { id: vehicleId }, data: { imageId: a.id } });
}

export async function archiveVehicle(actor: Actor, vehicleId: string, archive: boolean) {
  requirePermission(actor, "vehicles.manage");
  const v = await assertVehicleAccess(actor, vehicleId);
  await db.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { archivedAt: archive ? new Date() : null, ...(archive ? { status: "OUT_OF_SERVICE" } : {}) } });
    await audit(actor, { action: archive ? "vehicle.archive" : "vehicle.restore", entityType: "Vehicle", entityId: vehicleId, vehicleId, oldValues: { archivedAt: v.archivedAt, status: v.status } }, tx);
  });
}

/**
 * Einsatzstatus ändern. Die Freigabe („Einsatzbereit“) erfolgt ausschließlich manuell durch eine
 * berechtigte Person – niemals automatisch durch das Erledigen eines Mangels.
 */
export async function setVehicleStatus(actor: Actor, vehicleId: string, status: VehicleStatus, reason?: string) {
  requirePermission(actor, "vehicles.set_status");
  const v = await assertVehicleAccess(actor, vehicleId, db, false);
  if (!VEHICLE_STATUSES.includes(status)) throw invalid("Ungültiger Status");
  if (status !== "READY" && !reason?.trim()) throw invalid("Bitte eine Begründung angeben.", { reason: "Begründung erforderlich" });
  if (v.status === status) return;
  if (status === "READY") {
    const critical = await db.defect.count({ where: { vehicleId, severity: "CRITICAL", status: { in: ["NEW", "REVIEWED", "IN_PROGRESS", "WAITING_PARTS"] } } });
    if (critical > 0 && !reason?.trim())
      throw invalid("Es bestehen unbehobene kritische Mängel. Freigabe nur mit dokumentierter Begründung möglich.", { reason: "Begründung erforderlich" });
  }
  await db.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { status, statusReason: reason?.trim() || null, statusChangedAt: new Date() } });
    await tx.vehicleStatusChange.create({ data: { vehicleId, fromStatus: v.status, toStatus: status, reason: reason?.trim() || null, userId: actor.id } });
    await audit(actor, { action: "vehicle.status", entityType: "Vehicle", entityId: vehicleId, vehicleId, oldValues: { status: v.status }, newValues: { status, reason } }, tx);
    if (status === "NOT_READY" || status === "LIMITED") {
      const recipients = await recipientsFor({ permission: "vehicles.set_status", vehicleId, excludeUserId: actor.id }, tx);
      await notify(recipients, { type: "vehicle_status", title: `${v.name}: Status geändert`, body: reason, link: `/fahrzeuge/${vehicleId}` }, tx);
    }
  });
}

export async function addVehicleDocuments(actor: Actor, vehicleId: string, attachmentIds: string[]) {
  requirePermission(actor, "attachments.upload");
  if (!can(actor, "vehicles.manage") && !can(actor, "vehicles.set_status")) throw invalid("Keine Berechtigung, Fahrzeugdokumente hinzuzufügen.");
  await assertVehicleAccess(actor, vehicleId);
  await db.$transaction((tx) => linkAttachments(tx, actor, attachmentIds, { vehicleId }));
}

// ───────────── Stammdaten: Fahrzeugtypen ─────────────

export async function listVehicleTypes(includeArchived = false) {
  return db.vehicleType.findMany({ where: includeArchived ? {} : { archived: false }, orderBy: { name: "asc" }, include: { _count: { select: { vehicles: true } } } });
}

export async function upsertVehicleType(actor: Actor, input: { id?: string; name: string; description?: string; archived?: boolean }) {
  requirePermission(actor, "settings.manage");
  const d = parse(z.object({ id: optId(), name: reqText(60), description: optText(300), archived: z.boolean().optional() }), input);
  const dup = await db.vehicleType.findFirst({ where: { name: { equals: d.name, mode: "insensitive" }, ...(d.id ? { id: { not: d.id } } : {}) } });
  if (dup) throw invalid("Fahrzeugtyp existiert bereits", { name: "Bereits vorhanden" });
  const t = d.id
    ? await db.vehicleType.update({ where: { id: d.id }, data: { name: d.name, description: d.description ?? null, archived: d.archived ?? false } })
    : await db.vehicleType.create({ data: { name: d.name, description: d.description } });
  await audit(actor, { action: "master.update", entityType: "VehicleType", entityId: t.id, newValues: d });
  return t;
}

export async function assignableUsers() {
  return db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, username: true }, orderBy: { lastName: "asc" } });
}

export async function vehicleHistory(actor: Actor, vehicleId: string, take = 100) {
  await assertVehicleAccess(actor, vehicleId);
  if (!can(actor, "audit.view") && !can(actor, "reports.view")) return [];
  return db.auditLog.findMany({
    where: { vehicleId },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { firstName: true, lastName: true } } },
  });
}

export function ensureNotArchived(v: { archivedAt: Date | null }) {
  if (v.archivedAt) throw conflict("Das Fahrzeug ist archiviert.");
}
