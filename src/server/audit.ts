import type { Prisma } from "@prisma/client";
import type { Actor } from "./actor";
import { db, type Tx } from "./db";

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  vehicleId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
};

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val)));
}

/** Nur geänderte Felder zurückgeben (für alte/neue Werte im Protokoll). */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    const norm = (x: unknown) => (x instanceof Date ? x.toISOString() : x === undefined ? null : JSON.stringify(x));
    if (norm(a) !== norm(b)) {
      oldValues[key] = a ?? null;
      newValues[key] = b ?? null;
    }
  }
  return { oldValues, newValues, changed: Object.keys(newValues).length > 0 };
}

export async function audit(actor: Actor | null, entry: AuditEntry, tx: Tx = db) {
  await tx.auditLog.create({
    data: {
      userId: actor?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      vehicleId: entry.vehicleId ?? null,
      oldValues: toJson(entry.oldValues),
      newValues: toJson(entry.newValues),
      ip: actor?.ip ?? null,
    },
  });
}
