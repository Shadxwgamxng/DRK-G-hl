"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { createSession, deleteSession, SESSION_COOKIE } from "@/server/auth/session";
import { clientIp, getCurrentActor } from "@/server/auth/current";
import { db } from "@/server/db";
import { errorState, formObject } from "@/server/action";
import { authenticate, registerUser } from "@/server/services/users";

async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { identifier = "", password = "" } = formObject(fd);
  const res = await authenticate(identifier, password);
  if (!res.ok) return { ok: false, message: res.message, ts: Date.now() };
  const h = await headers();
  const { token, expiresAt } = await createSession(res.userId, { userAgent: h.get("user-agent"), ip: await clientIp() });
  await setSessionCookie(token, expiresAt);
  await db.auditLog.create({ data: { userId: res.userId, action: "user.login", entityType: "User", entityId: res.userId, ip: await clientIp() } });
  const next = formObject(fd).next;
  redirect(res.status === "PENDING" ? "/freigabe-ausstehend" : next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await registerUser(formObject(fd));
  } catch (e) {
    return errorState(e);
  }
  redirect("/login?registriert=1");
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/login?abgemeldet=1");
}

export async function refreshStatusAction() {
  const actor = await getCurrentActor();
  if (actor?.status === "ACTIVE") redirect("/");
  redirect("/freigabe-ausstehend?geprueft=1");
}
