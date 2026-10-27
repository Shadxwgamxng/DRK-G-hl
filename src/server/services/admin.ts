import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { Actor } from "../actor";
import { requirePermission } from "../actor";
import { audit } from "../audit";
import { invalid } from "../errors";
import { DEFAULT_SETTINGS, getSettings, type AppSettings } from "../settings";

export async function listAuditLogs(actor: Actor, f: { entityType?: string; userId?: string; vehicleId?: string; action?: string; from?: Date; to?: Date } = {}, take = 300) {
  requirePermission(actor, "audit.view");
  const where: Prisma.AuditLogWhereInput = {};
  if (f.entityType) where.entityType = f.entityType;
  if (f.userId) where.userId = f.userId;
  if (f.vehicleId) where.vehicleId = f.vehicleId;
  if (f.action) where.action = { startsWith: f.action };
  if (f.from || f.to) where.createdAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) };
  return db.auditLog.findMany({ where, include: { user: { select: { firstName: true, lastName: true, username: true } } }, orderBy: { createdAt: "desc" }, take });
}

export async function updateSettings(actor: Actor, input: Partial<AppSettings>) {
  requirePermission(actor, "settings.manage");
  const before = await getSettings();
  const next: AppSettings = { ...before };
  if (input.medicationsEnabled !== undefined) next.medicationsEnabled = Boolean(input.medicationsEnabled);
  if (input.emailNotificationsEnabled !== undefined) next.emailNotificationsEnabled = Boolean(input.emailNotificationsEnabled);
  if (input.multiVehicleAssignmentEnabled !== undefined) next.multiVehicleAssignmentEnabled = Boolean(input.multiVehicleAssignmentEnabled);
  if (input.expiryWarningDays !== undefined) {
    const n = Number(input.expiryWarningDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw invalid("Vorwarnzeit muss zwischen 1 und 365 Tagen liegen.", { expiryWarningDays: "1–365" });
    next.expiryWarningDays = n;
  }
  if (input.organizationName !== undefined) {
    const s = String(input.organizationName).trim();
    if (!s || s.length > 120) throw invalid("Organisationsname ungültig", { organizationName: "1–120 Zeichen" });
    next.organizationName = s;
  }
  await db.$transaction(async (tx) => {
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
      if (before[key] !== next[key]) {
        await tx.setting.upsert({ where: { key }, create: { key, value: next[key] }, update: { value: next[key] } });
      }
    }
    await audit(actor, { action: "settings.update", entityType: "Setting", oldValues: before, newValues: next }, tx);
  });
  return next;
}

export async function listNotifications(actor: Actor, onlyUnread = false, take = 100) {
  return db.notification.findMany({ where: { userId: actor.id, ...(onlyUnread ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take });
}

export async function unreadNotificationCount(actor: Actor) {
  return db.notification.count({ where: { userId: actor.id, readAt: null } });
}

export async function markNotificationsRead(actor: Actor, ids?: string[]) {
  await db.notification.updateMany({ where: { userId: actor.id, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
