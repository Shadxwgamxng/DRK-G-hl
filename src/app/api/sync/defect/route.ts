import { NextResponse, type NextRequest } from "next/server";
import { apiActor, apiError, assertSameOrigin, badOrigin, unauthorized } from "@/server/api";
import { createDefect } from "@/server/services/defects";

export const runtime = "nodejs";

/** Online-Meldung und Offline-Synchronisation von Mängeln (idempotent über clientRef). */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return badOrigin();
  const actor = await apiActor(req);
  if (!actor) return unauthorized();
  try {
    const body = await req.json();
    const res = await createDefect(actor, body.payload, Array.isArray(body.attachmentIds) ? body.attachmentIds : []);
    return NextResponse.json({ ok: true, id: res.defect.id, duplicate: res.duplicate, readinessWarning: res.readinessWarning });
  } catch (e) {
    return apiError(e);
  }
}
