import Link from "next/link";
import { Bell, Search } from "lucide-react";
import type { Actor } from "@/server/actor";
import { can } from "@/server/actor";
import { db } from "@/server/db";
import { viaVehicle } from "@/server/access";
import { getSettings } from "@/server/settings";
import { ACTIVE_REFILL_STATUSES, OPEN_DEFECT_STATUSES } from "@/lib/labels";
import { unreadNotificationCount } from "@/server/services/admin";
import { BottomNav, LogoutButton, Sidebar, type NavItem } from "./nav";
import { SyncIndicator } from "./pwa";
import { DrkLogo } from "./brand";
import { SyncRunner } from "./sync";

export async function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const [unread, openDefects, openRefills, pendingUsers, settings] = await Promise.all([
    unreadNotificationCount(actor),
    db.defect.count({ where: { ...viaVehicle(actor), status: { in: [...OPEN_DEFECT_STATUSES] } } }),
    db.refillRequest.count({ where: { ...viaVehicle(actor), status: { in: [...ACTIVE_REFILL_STATUSES] } } }),
    can(actor, "users.manage") ? db.user.count({ where: { status: "PENDING" } }) : 0,
    getSettings(),
  ]);

  const items: NavItem[] = [
    { href: "/", label: "Übersicht", icon: "dashboard" },
    { href: "/fahrzeuge", label: "Fahrzeuge", icon: "vehicles" },
    { href: "/maengel", label: "Mängel", icon: "defects", badge: openDefects || undefined },
    { href: "/nachfuellung", label: "Nachfüllung", icon: "refill", badge: openRefills || undefined },
    ...(can(actor, "inspections.view") ? [{ href: "/termine", label: "Prüfungen & Termine", icon: "inspections" } as NavItem] : []),
    { href: "/kontrollen", label: "Kontrollen", icon: "checks" },
    ...(can(actor, "warehouse.view") ? [{ href: "/lager", label: "Zentrallager", icon: "warehouse" } as NavItem] : []),
    ...(can(actor, "materials.catalog") ? [{ href: "/material", label: "Materialkatalog", icon: "material" } as NavItem] : []),
    ...(can(actor, "reports.view") ? [{ href: "/berichte", label: "Berichte", icon: "reports" } as NavItem] : []),
    { href: "/benachrichtigungen", label: "Benachrichtigungen", icon: "notifications", badge: unread || undefined },
    { href: "/sync", label: "Synchronisation", icon: "sync" },
    { href: "/profil", label: "Mein Profil", icon: "profile" },
    ...(can(actor, "users.manage") ? [{ href: "/admin/benutzer", label: "Benutzer", icon: "users", badge: pendingUsers || undefined, section: "admin" } as NavItem] : []),
    ...(can(actor, "roles.manage") ? [{ href: "/admin/rollen", label: "Rollen & Rechte", icon: "roles", section: "admin" } as NavItem] : []),
    ...(can(actor, "checklists.manage") ? [{ href: "/admin/checklisten", label: "Checklisten", icon: "checklists", section: "admin" } as NavItem] : []),
    ...(can(actor, "settings.manage") ? [{ href: "/admin/einstellungen", label: "Einstellungen", icon: "settings", section: "admin" } as NavItem] : []),
    ...(can(actor, "audit.view") ? [{ href: "/admin/protokoll", label: "Änderungsprotokoll", icon: "audit", section: "admin" } as NavItem] : []),
  ];

  const footer = (
    <div>
      <div className="mb-2 px-3 text-xs text-gray-600">
        <p className="truncate font-bold text-drkblue-900">
          {actor.firstName} {actor.lastName}
        </p>
        <p className="truncate">{actor.roleName}</p>
      </div>
      <LogoutButton userId={actor.id} />
    </div>
  );

  return (
    <div className="min-h-dvh">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-3">
        Zum Inhalt springen
      </a>
      <Sidebar items={items} footer={footer} />
      <div className="lg:pl-80">
        {settings.demoMode && (
          <div className="bg-drkblue-900 px-4 py-1.5 text-center text-sm font-bold text-white" role="status">
            DEMO-MODUS – Beispieldaten, keine echten Einsatzdaten
          </div>
        )}
        {/* Mobil: Wort-Bild-Marke auf Weiß in Mindesthöhe (scrollt weg), darunter die fixierte Suchleiste */}
        <div className="border-b border-gray-300 bg-white px-4 pb-3 lg:hidden" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
          <Link href="/" aria-label="Zur Übersicht" className="inline-block">
            <DrkLogo className="h-[60px] w-auto" priority />
          </Link>
        </div>
        <header className="sticky top-0 z-20 border-b border-gray-300 bg-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex items-center gap-2 px-4 py-2 sm:px-6">
            <form action="/suche" className="relative min-w-0 flex-1" role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
              <input type="search" name="q" placeholder="Suche: Fahrzeug, Material, Mangel, Charge …" aria-label="Globale Suche" className="input min-h-11 pl-10" />
            </form>
            <SyncIndicator userId={actor.id} />
            <Link href="/benachrichtigungen" className="focus-ring relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-drkblue-50" aria-label={`Benachrichtigungen${unread ? ` (${unread} ungelesen)` : ""}`}>
              <Bell className="h-6 w-6 text-drkblue-900" aria-hidden />
              {unread > 0 && <span className="absolute right-1 top-1 min-w-5 rounded-full bg-drk-500 px-1 text-center text-[11px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          </div>
        </header>
        <main id="inhalt" className="pb-safe mx-auto max-w-7xl px-4 py-5 sm:px-6">
          {children}
        </main>
      </div>
      <SyncRunner userId={actor.id} />
      <BottomNav items={items} primary={["/", "/fahrzeuge", "/maengel", "/nachfuellung"]} footer={<LogoutButton userId={actor.id} />} />
    </div>
  );
}
