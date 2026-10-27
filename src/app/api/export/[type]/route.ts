import { NextResponse, type NextRequest } from "next/server";
import { apiActor, apiError, unauthorized } from "@/server/api";
import { buildReport, toCsv, toPdf } from "@/server/services/reports";

export const runtime = "nodejs";

const date = (v: string | null, end = false) => {
  if (!v) return undefined;
  const d = new Date(`${v}T${end ? "23:59:59" : "00:00:00"}`);
  return isNaN(d.getTime()) ? undefined : d;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const actor = await apiActor(req);
  if (!actor) return unauthorized();
  try {
    const { type } = await params;
    const sp = req.nextUrl.searchParams;
    const report = await buildReport(actor, type, {
      vehicleId: sp.get("vehicleId") || undefined,
      from: date(sp.get("from")),
      to: date(sp.get("to"), true),
      status: sp.get("status") || undefined,
      severity: sp.get("severity") || undefined,
      category: sp.get("category") || undefined,
      days: sp.get("days") ? Number(sp.get("days")) : undefined,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    if (sp.get("format") === "pdf") {
      const pdf = await toPdf(report, actor);
      return new NextResponse(new Uint8Array(pdf), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${type}-${stamp}.pdf"`, "Cache-Control": "private, no-store" },
      });
    }
    return new NextResponse(toCsv(report), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${type}-${stamp}.csv"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
