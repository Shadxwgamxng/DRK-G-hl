import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/registrieren", "/datenschutz", "/nutzungsbedingungen", "/offline", "/api/health", "/api/cron", "/verbrauch"];

/**
 * Grobe Vorprüfung (Edge): ohne Sitzungscookie → Login. Die eigentliche Prüfung der Sitzung und
 * aller Rechte erfolgt serverseitig in jeder Seite, Server Action und API-Route.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!req.cookies.get("drk_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, code: "UNAUTHENTICATED", message: "Bitte anmelden." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|brand/|manifest.webmanifest|sw.js|favicon.ico|robots.txt|offline).*)"],
};
