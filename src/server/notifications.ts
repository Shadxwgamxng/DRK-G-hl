import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

export type NotifyInput = {
  type: string;
  title: string;
  body?: string;
  link?: string;
  /** gleicher Schlüssel ⇒ keine erneute Benachrichtigung desselben Benutzers */
  dedupeKey?: string;
};

/** Empfänger: aktive Benutzer mit Recht X, die das Fahrzeug sehen dürfen. */
export async function recipientsFor(
  opts: { permission: string; vehicleId?: string | null; excludeUserId?: string },
  tx: Tx = db,
): Promise<string[]> {
  const permFilter: Prisma.UserWhereInput = {
    status: "ACTIVE",
    role: { permissions: { some: { permission: { key: opts.permission } } } },
  };
  const vehicleFilter: Prisma.UserWhereInput | undefined = opts.vehicleId
    ? {
        OR: [
          { role: { permissions: { some: { permission: { key: "vehicles.view_all" } } } } },
          { assignments: { some: { vehicleId: opts.vehicleId } } },
        ],
      }
    : undefined;
  const users = await tx.user.findMany({
    where: { AND: [permFilter, ...(vehicleFilter ? [vehicleFilter] : [])], ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}) },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function notify(userIds: string[], n: NotifyInput, tx: Tx = db) {
  if (userIds.length === 0) return 0;
  const res = await tx.notification.createMany({
    data: [...new Set(userIds)].map((userId) => ({
      userId,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      dedupeKey: n.dedupeKey,
    })),
    skipDuplicates: true, // nutzt den Unique-Index (userId, dedupeKey)
  });
  return res.count;
}
