import { NextResponse, type NextRequest } from "next/server";
import { apiActor, apiError, unauthorized } from "@/server/api";
import { getAttachmentForDownload } from "@/server/services/attachments";
import { readStoredFile } from "@/server/storage";

export const runtime = "nodejs";

/** Geschützte Dateiauslieferung: jede Anfrage prüft Sitzung UND Berechtigung am verknüpften Datensatz. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await apiActor(req);
  if (!actor) return unauthorized();
  try {
    const { id } = await params;
    const a = await getAttachmentForDownload(actor, id);
    const data = await readStoredFile(a.storageKey);
    const download = req.nextUrl.searchParams.get("download") === "1";
    const filename = encodeURIComponent(a.originalName);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": a.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
