import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { Actor } from "./actor";
import { SESSION_COOKIE, validateSessionToken } from "./auth/session";
import { isAppError } from "./errors";

/** Schutz vor CSRF für API-POSTs: Origin muss zur eigenen Domain passen. */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function apiActor(req: NextRequest): Promise<Actor | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const actor = await validateSessionToken(token, ip);
  return actor && actor.status === "ACTIVE" ? actor : null;
}

export function apiError(e: unknown) {
  if (isAppError(e)) {
    const status = { FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 422, CONFLICT: 409, UNAUTHENTICATED: 401 }[e.code];
    return NextResponse.json({ ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors }, { status });
  }
  console.error(e);
  return NextResponse.json({ ok: false, code: "INTERNAL", message: "Unerwarteter Serverfehler." }, { status: 500 });
}

export const unauthorized = () => NextResponse.json({ ok: false, code: "UNAUTHENTICATED", message: "Bitte erneut anmelden." }, { status: 401 });
export const badOrigin = () => NextResponse.json({ ok: false, code: "FORBIDDEN", message: "Ungültige Herkunft der Anfrage." }, { status: 403 });
