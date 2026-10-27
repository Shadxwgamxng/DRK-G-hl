import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import type { Actor } from "../actor";

export const SESSION_COOKIE = "drk_session";

export function sessionTtlMs() {
  return (Number(process.env.SESSION_TTL_HOURS) || 12) * 3600 * 1000;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await db.session.create({
    data: { id: hashToken(token), userId, expiresAt, userAgent: meta.userAgent?.slice(0, 300), ip: meta.ip },
  });
  return { token, expiresAt };
}

export async function deleteSession(token: string) {
  await db.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function deleteAllSessionsOfUser(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

export async function loadActor(userId: string, ip?: string | null): Promise<Actor | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    status: u.status,
    roleKey: u.role.key,
    roleName: u.role.name,
    permissions: new Set(u.role.permissions.map((p) => p.permission.key)),
    canPerformChecks: u.canPerformChecks,
    ip,
  };
}

/** Prüft das Sitzungstoken serverseitig. Abgelaufene oder gesperrte Sitzungen werden verworfen. */
export async function validateSessionToken(token: string, ip?: string | null): Promise<Actor | null> {
  const id = hashToken(token);
  const session = await db.session.findUnique({ where: { id } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }
  const actor = await loadActor(session.userId, ip);
  if (!actor || !["ACTIVE", "PENDING"].includes(actor.status)) {
    await db.session.deleteMany({ where: { userId: session.userId } });
    return null;
  }
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return actor;
}
