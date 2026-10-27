import { NextResponse, type NextRequest } from "next/server";
import { apiActor, apiError, assertSameOrigin, badOrigin, unauthorized } from "@/server/api";
import { performCheck } from "@/server/services/checks";

export const runtime = "nodejs";

/** Online-Abschluss und Offline-Synchronisation von Fahrzeugkontrollen (idempotent über clientRef). */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return badOrigin();
  const actor = await apiActor(req);
  if (!actor) return unauthorized();
  try {
    const body = await req.json();
    const res = await performCheck(actor, String(body.vehicleId ?? ""), body.payload, Array.isArray(body.attachmentIds) ? body.attachmentIds : []);
    return NextResponse.json({ ok: true, id: res.check.id, duplicate: res.duplicate, defectIds: res.defectIds });
  } catch (e) {
    return apiError(e);
  }
}
