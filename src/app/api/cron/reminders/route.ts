import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/server/services/reminders";

export const runtime = "nodejs";

/** Täglich per Cron aufrufen: curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/reminders */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret.length < 16 || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await runReminders();
  return NextResponse.json({ ok: true, ...result });
}
