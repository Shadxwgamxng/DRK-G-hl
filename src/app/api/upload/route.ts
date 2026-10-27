import { NextResponse, type NextRequest } from "next/server";
import { apiActor, apiError, assertSameOrigin, badOrigin, unauthorized } from "@/server/api";
import { createUpload } from "@/server/services/attachments";
import { maxUploadBytes } from "@/server/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return badOrigin();
  const actor = await apiActor(req);
  if (!actor) return unauthorized();
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxUploadBytes() + 64 * 1024) {
    return NextResponse.json({ ok: false, message: `Die Datei ist zu groß (max. ${Math.round(maxUploadBytes() / 1048576)} MB).` }, { status: 413 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, message: "Keine Datei übermittelt." }, { status: 400 });
    const data = Buffer.from(await file.arrayBuffer());
    const att = await createUpload(actor, { name: file.name, data });
    return NextResponse.json({ ok: true, attachment: att });
  } catch (e) {
    return apiError(e);
  }
}
