import { NextResponse, type NextRequest } from "next/server";
import { apiActor, apiError, assertSameOrigin, badOrigin, unauthorized } from "@/server/api";
import { writeOffMaterial } from "@/server/services/materials";

export const runtime = "nodejs";

/** Material austragen (online oder nachträgliche Synchronisation, idempotent über clientRef). */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return badOrigin();
  const actor = await apiActor(req);
  if (!actor) return unauthorized();
  try {
    const body = await req.json();
    const res = await writeOffMaterial(actor, body.payload, Array.isArray(body.attachmentIds) ? body.attachmentIds : []);
    return NextResponse.json({ ok: true, id: res.movement.id, duplicate: res.duplicate });
  } catch (e) {
    return apiError(e);
  }
}
