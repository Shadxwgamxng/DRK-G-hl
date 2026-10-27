import type { DefectCategory, DefectSeverity, DefectStatus, Prisma } from "@prisma/client";
import { z, optDate, optId, optInt, optText, reqText } from "@/lib/validation";
import { DEFECT_STATUS, OPEN_DEFECT_STATUSES } from "@/lib/labels";
import { db, type Tx } from "../db";
import type { Actor } from "../actor";
import { can, requirePermission } from "../actor";
import { assertVehicleAccess, viaVehicle } from "../access";
import { audit } from "../audit";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { notify, recipientsFor } from "../notifications";
import { parse } from "../validate";
import { linkAttachments } from "./attachments";

export const DEFECT_CATEGORIES = ["VEHICLE_TECH", "BODY", "ELECTRICAL", "TIRES", "MEDICAL_DEVICES", "MATERIAL", "HYGIENE", "EQUIPMENT", "OTHER"] as const;
export const DEFECT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const DEFECT_STATUSES = ["NEW", "REVIEWED", "IN_PROGRESS", "WAITING_PARTS", "RESOLVED", "CLOSED"] as const;

export const defectInputSchema = z.object({
  vehicleId: z.string().min(1, "Bitte Fahrzeug wählen"),
  title: reqText(150),
  description: reqText(5000),
  category: z.enum(DEFECT_CATEGORIES),
  severity: z.enum(DEFECT_SEVERITIES),
  mileage: optInt(0, 5_000_000),
  assignedToId: optId(),
  dueDate: optDate(),
  affectsReadiness: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(false),
  reportedAt: optDate(), // nur für Offline-Erfassung relevant
  clientRef: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
});

export type DefectInput = z.infer<typeof defectInputSchema>;

/** Gemeinsame Anlage-Logik (auch aus Fahrzeugkontrollen heraus) – läuft in einer Transaktion. */
export async function createDefectTx(
  tx: Tx,
  actor: Actor,
  d: DefectInput,
  extra: { vehicleCheckId?: string; checkItemLabel?: string; attachmentIds?: string[]; offline?: boolean } = {},
) {
  requirePermission(actor, "defects.report");
  const vehicle = await assertVehicleAccess(actor, d.vehicleId, tx, false);
  if (d.assignedToId && !can(actor, "defects.manage")) d.assignedToId = undefined;
  const now = new Date();
  const reportedAt = d.reportedAt && d.reportedAt < now ? d.reportedAt : now;
  const defect = await tx.defect.create({
    data: {
      vehicleId: d.vehicleId,
      title: d.title,
      description: d.description,
      category: d.category as DefectCategory,
      severity: d.severity as DefectSeverity,
      mileage: d.mileage,
      assignedToId: d.assignedToId,
      dueDate: d.dueDate,
      affectsReadiness: d.affectsReadiness || d.severity === "CRITICAL",
      reportedAt,
      reportedById: actor.id,
      vehicleCheckId: extra.vehicleCheckId,
      checkItemLabel: extra.checkItemLabel,
      clientRef: d.clientRef,
      offlineCreatedAt: extra.offline ? reportedAt : null,
    },
  });
  await linkAttachments(tx, actor, extra.attachmentIds, { defectId: defect.id });
  if (d.mileage && (!vehicle.mileage || d.mileage > vehicle.mileage)) {
    await tx.vehicle.update({ where: { id: vehicle.id }, data: { mileage: d.mileage } });
  }
  await audit(actor, { action: "defect.create", entityType: "Defect", entityId: defect.id, vehicleId: vehicle.id, newValues: { title: d.title, severity: d.severity, category: d.category } }, tx);

  const critical = d.severity === "CRITICAL";
  const recipients = await recipientsFor({ permission: "defects.manage", vehicleId: vehicle.id, excludeUserId: actor.id }, tx);
  await notify(
    recipients,
    {
      type: critical ? "defect_critical" : "defect_new",
      title: `${critical ? "KRITISCHER MANGEL" : "Neuer Mangel"}: ${vehicle.name}`,
      body: d.title,
      link: `/maengel/${defect.id}`,
      dedupeKey: `defect:${defect.id}`,
    },
    tx,
  );
  if (d.assignedToId && d.assignedToId !== actor.id) {
    await notify([d.assignedToId], { type: "defect_assigned", title: "Mangel zugewiesen", body: d.title, link: `/maengel/${defect.id}`, dedupeKey: `defect-assigned:${defect.id}:${d.assignedToId}` }, tx);
  }
  return { defect, readinessWarning: defect.affectsReadiness && vehicle.status === "READY" };
}

export async function createDefect(actor: Actor, input: unknown, attachmentIds?: string[]) {
  const d = parse(defectInputSchema, input);
  if (d.clientRef) {
    const existing = await db.defect.findUnique({ where: { clientRef: d.clientRef } });
    if (existing) {
      if (existing.reportedById !== actor.id) throw conflict("Synchronisationskonflikt: Kennung bereits verwendet.");
      return { defect: existing, readinessWarning: false, duplicate: true };
    }
  }
  const res = await db.$transaction((tx) => createDefectTx(tx, actor, d, { attachmentIds, offline: Boolean(d.clientRef && d.reportedAt) }));
  return { ...res, duplicate: false };
}

export type DefectFilter = {
  vehicleId?: string;
  status?: string; // "open" | "closed" | DefectStatus
  severity?: string;
  category?: string;
  assignedToId?: string;
  from?: Date;
  to?: Date;
  q?: string;
};

export function defectWhere(actor: Actor, f: DefectFilter = {}): Prisma.DefectWhereInput {
  const where: Prisma.DefectWhereInput = { ...viaVehicle(actor) };
  if (f.vehicleId) where.vehicleId = f.vehicleId;
  if (f.status === "open" || !f.status) where.status = { in: [...OPEN_DEFECT_STATUSES] };
  else if (f.status === "closed") where.status = "CLOSED";
  else if (f.status !== "all" && f.status in DEFECT_STATUS) where.status = f.status as DefectStatus;
  if (f.severity && (DEFECT_SEVERITIES as readonly string[]).includes(f.severity)) where.severity = f.severity as DefectSeverity;
  if (f.category && (DEFECT_CATEGORIES as readonly string[]).includes(f.category)) where.category = f.category as DefectCategory;
  if (f.assignedToId) where.assignedToId = f.assignedToId;
  if (f.from || f.to) where.reportedAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  if (f.q) where.OR = [{ title: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }];
  return where;
}

const severityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export async function listDefects(actor: Actor, f: DefectFilter = {}, take = 200) {
  const rows = await db.defect.findMany({
    where: defectWhere(actor, f),
    include: {
      vehicle: { select: { id: true, name: true, licensePlate: true } },
      reportedBy: { select: { firstName: true, lastName: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
      _count: { select: { attachments: true, comments: true } },
    },
    orderBy: { reportedAt: "desc" },
    take,
  });
  return rows.sort((a, b) => {
    const ao = a.status === "CLOSED" ? 1 : 0;
    const bo = b.status === "CLOSED" ? 1 : 0;
    return ao - bo || severityRank[a.severity] - severityRank[b.severity] || b.reportedAt.getTime() - a.reportedAt.getTime();
  });
}

export async function getDefect(actor: Actor, id: string) {
  const d = await db.defect.findFirst({
    where: { id, ...viaVehicle(actor) },
    include: {
      vehicle: true,
      reportedBy: { select: { id: true, firstName: true, lastName: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      resolvedBy: { select: { firstName: true, lastName: true } },
      closedBy: { select: { firstName: true, lastName: true } },
      vehicleCheck: { select: { id: true, performedAt: true } },
      attachments: { orderBy: { createdAt: "asc" }, include: { uploadedBy: { select: { firstName: true, lastName: true } } } },
      comments: { orderBy: { createdAt: "asc" }, include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!d) throw notFound("Mangel nicht gefunden oder kein Zugriff.");
  return d;
}

const updateSchema = z.object({
  title: reqText(150),
  description: reqText(5000),
  category: z.enum(DEFECT_CATEGORIES),
  severity: z.enum(DEFECT_SEVERITIES),
  assignedToId: optId(),
  dueDate: optDate(),
  affectsReadiness: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
});

export async function updateDefect(actor: Actor, id: string, input: unknown) {
  requirePermission(actor, "defects.manage");
  const before = await getDefect(actor, id);
  if (before.status === "CLOSED") throw conflict("Abgeschlossene Mängel können nicht bearbeitet werden.");
  const d = parse(updateSchema, input);
  if (d.assignedToId) {
    const ok = await db.user.count({ where: { id: d.assignedToId, status: "ACTIVE" } });
    if (!ok) throw invalid("Zuständige Person ungültig", { assignedToId: "Benutzer nicht aktiv" });
  }
  await db.$transaction(async (tx) => {
    await tx.defect.update({ where: { id }, data: { ...d, assignedToId: d.assignedToId ?? null, dueDate: d.dueDate ?? null } });
    const old = { title: before.title, severity: before.severity, category: before.category, assignedToId: before.assignedTo?.id ?? null, dueDate: before.dueDate };
    await audit(actor, { action: "defect.update", entityType: "Defect", entityId: id, vehicleId: before.vehicleId, oldValues: old, newValues: d }, tx);
    if (d.assignedToId && d.assignedToId !== before.assignedTo?.id) {
      const u = await tx.user.findUnique({ where: { id: d.assignedToId }, select: { firstName: true, lastName: true } });
      await tx.defectComment.create({ data: { defectId: id, userId: actor.id, kind: "ASSIGNMENT", text: `Zuständig: ${u?.firstName} ${u?.lastName}` } });
      if (d.assignedToId !== actor.id)
        await notify([d.assignedToId], { type: "defect_assigned", title: "Mangel zugewiesen", body: d.title, link: `/maengel/${id}`, dedupeKey: `defect-assigned:${id}:${d.assignedToId}` }, tx);
    }
    if (d.severity === "CRITICAL" && before.severity !== "CRITICAL") {
      const r = await recipientsFor({ permission: "defects.manage", vehicleId: before.vehicleId, excludeUserId: actor.id }, tx);
      await notify(r, { type: "defect_critical", title: `KRITISCHER MANGEL: ${before.vehicle.name}`, body: d.title, link: `/maengel/${id}`, dedupeKey: `defect-critical:${id}` }, tx);
    }
  });
}

const TRANSITIONS: Record<DefectStatus, DefectStatus[]> = {
  NEW: ["REVIEWED", "IN_PROGRESS", "WAITING_PARTS", "RESOLVED"],
  REVIEWED: ["IN_PROGRESS", "WAITING_PARTS", "RESOLVED"],
  IN_PROGRESS: ["WAITING_PARTS", "RESOLVED"],
  WAITING_PARTS: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
};

export function allowedTransitions(status: DefectStatus) {
  return TRANSITIONS[status];
}

const statusSchema = z.object({
  status: z.enum(DEFECT_STATUSES),
  comment: optText(4000),
  measures: optText(5000),
  resolvedById: optId(),
  resolvedAt: optDate(),
});

/**
 * Statuswechsel im Bearbeitungsworkflow.
 * Wichtig: Der Fahrzeugstatus wird hierbei NIE automatisch auf „Einsatzbereit“ gesetzt.
 */
export async function changeDefectStatus(actor: Actor, id: string, input: unknown) {
  const d = parse(statusSchema, input);
  const defect = await getDefect(actor, id);
  const to = d.status as DefectStatus;
  if (!TRANSITIONS[defect.status].includes(to))
    throw conflict(`Statuswechsel von „${DEFECT_STATUS[defect.status]}“ nach „${DEFECT_STATUS[to]}“ ist nicht zulässig.`);

  if (to === "CLOSED" || defect.status === "CLOSED") requirePermission(actor, "defects.close");
  else requirePermission(actor, "defects.manage");

  const data: Prisma.DefectUpdateInput = { status: to };
  if (to === "RESOLVED") {
    if (!d.measures) throw invalid("Bitte die durchgeführten Maßnahmen dokumentieren.", { measures: "Maßnahmen erforderlich" });
    const resolverId = d.resolvedById || actor.id;
    const resolver = await db.user.findFirst({ where: { id: resolverId, status: "ACTIVE" } });
    if (!resolver) throw invalid("Verantwortliche Person ungültig", { resolvedById: "Benutzer nicht aktiv" });
    const resolvedAt = d.resolvedAt ?? new Date();
    if (resolvedAt.getTime() > Date.now() + 60_000) throw invalid("Erledigungsdatum liegt in der Zukunft", { resolvedAt: "Datum in der Zukunft" });
    Object.assign(data, { measures: d.measures, resolvedAt, resolvedBy: { connect: { id: resolverId } } });
  }
  if (to === "CLOSED") {
    if (!defect.measures) throw conflict("Ohne dokumentierte Maßnahmen kann der Mangel nicht abgeschlossen werden.");
    Object.assign(data, { closedAt: new Date(), closedBy: { connect: { id: actor.id } } });
  }
  if (to === "IN_PROGRESS" && (defect.status === "RESOLVED" || defect.status === "CLOSED")) {
    if (!d.comment) throw invalid("Bitte begründen, warum der Mangel erneut bearbeitet werden muss.", { comment: "Begründung erforderlich" });
    Object.assign(data, { closedAt: null, closedBy: { disconnect: true } });
  }

  await db.$transaction(async (tx) => {
    await tx.defect.update({ where: { id }, data });
    const text = [`Status: ${DEFECT_STATUS[defect.status]} → ${DEFECT_STATUS[to]}`, d.measures ? `Maßnahmen: ${d.measures}` : null, d.comment]
      .filter(Boolean)
      .join("\n");
    await tx.defectComment.create({ data: { defectId: id, userId: actor.id, kind: to === "RESOLVED" ? "MEASURE" : "STATUS_CHANGE", text } });
    await audit(
      actor,
      { action: to === "CLOSED" ? "defect.close" : "defect.status", entityType: "Defect", entityId: id, vehicleId: defect.vehicleId, oldValues: { status: defect.status }, newValues: { status: to, measures: d.measures } },
      tx,
    );
    if (to === "RESOLVED") {
      const closers = await recipientsFor({ permission: "defects.close", vehicleId: defect.vehicleId, excludeUserId: actor.id }, tx);
      await notify(closers, { type: "defect_resolved", title: `Mangel behoben – Abschlusskontrolle: ${defect.vehicle.name}`, body: defect.title, link: `/maengel/${id}`, dedupeKey: `defect-resolved:${id}:${Date.now()}` }, tx);
    }
    if (defect.reportedById !== actor.id && (to === "RESOLVED" || to === "CLOSED")) {
      await notify([defect.reportedById], { type: "defect_status", title: `Ihr gemeldeter Mangel: ${DEFECT_STATUS[to]}`, body: defect.title, link: `/maengel/${id}`, dedupeKey: `defect-status:${id}:${to}` }, tx);
    }
  });
  const vehicleNeedsRelease = to === "CLOSED" && defect.vehicle.status !== "READY";
  return { vehicleNeedsRelease };
}

export async function addDefectComment(actor: Actor, id: string, text: string | undefined, attachmentIds: string[] = []) {
  const defect = await getDefect(actor, id);
  const own = defect.reportedById === actor.id;
  if (!can(actor, "defects.manage") && !(own && can(actor, "defects.report"))) throw forbidden("Nur eigene Mängelmeldungen können ergänzt werden.");
  const t = text?.trim();
  if (!t && attachmentIds.length === 0) throw invalid("Bitte einen Kommentar oder ein Foto hinzufügen.", { text: "Pflichtfeld" });
  if (t && t.length > 4000) throw invalid("Kommentar zu lang", { text: "Höchstens 4000 Zeichen" });
  if (attachmentIds.length) requirePermission(actor, "attachments.upload");
  await db.$transaction(async (tx) => {
    await linkAttachments(tx, actor, attachmentIds, { defectId: id });
    await tx.defectComment.create({
      data: { defectId: id, userId: actor.id, kind: "COMMENT", text: t || `${attachmentIds.length} Anhang/Anhänge hinzugefügt` },
    });
    if (attachmentIds.length) await audit(actor, { action: "attachment.upload", entityType: "Defect", entityId: id, vehicleId: defect.vehicleId, newValues: { attachmentIds } }, tx);
  });
}

export async function defectCounts(actor: Actor, vehicleIds?: string[]) {
  const base: Prisma.DefectWhereInput = { ...viaVehicle(actor), status: { in: [...OPEN_DEFECT_STATUSES] }, ...(vehicleIds ? { vehicleId: { in: vehicleIds } } : {}) };
  const [open, critical] = await Promise.all([db.defect.count({ where: base }), db.defect.count({ where: { ...base, severity: "CRITICAL" } })]);
  return { open, critical };
}
