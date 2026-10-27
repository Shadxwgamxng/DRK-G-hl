import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validateSessionToken } from "./session";
import type { Actor } from "../actor";
import { can } from "../actor";
import type { PermissionKey } from "../permissions";

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token, await clientIp());
});

/** Für Seiten: leitet auf Login bzw. „Freigabe ausstehend“ um. */
export async function requireActiveActor(permission?: PermissionKey): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.status === "PENDING") redirect("/freigabe-ausstehend");
  if (permission && !can(actor, permission)) redirect("/?fehler=berechtigung");
  return actor;
}
