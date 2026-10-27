import type { UserStatus } from "@prisma/client";
import type { PermissionKey } from "./permissions";
import { forbidden } from "./errors";

/** Der angemeldete, serverseitig geprüfte Benutzer inkl. effektiver Rechte. */
export type Actor = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  status: UserStatus;
  roleKey: string;
  roleName: string;
  permissions: ReadonlySet<string>;
  canPerformChecks: boolean;
  ip?: string | null;
};

export function can(actor: Actor, permission: PermissionKey): boolean {
  if (actor.status !== "ACTIVE") return false;
  if (permission === "checks.perform" && actor.roleKey === "USER" && !actor.canPerformChecks) return false;
  return actor.permissions.has(permission);
}

export function requirePermission(actor: Actor, permission: PermissionKey): void {
  if (!can(actor, permission)) throw forbidden();
}

export function isAdmin(actor: Actor) {
  return actor.status === "ACTIVE" && actor.roleKey === "ADMIN";
}

export function displayName(u: { firstName: string; lastName: string }) {
  return `${u.firstName} ${u.lastName}`.trim();
}
