"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackagePlus,
  Settings,
  ShieldCheck,
  Truck,
  User,
  Users,
  X,
  RefreshCw,
} from "lucide-react";
import { clearDrafts, listDrafts } from "@/lib/offline-store";
import { logoutAction } from "@/app/actions/auth";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; section?: "main" | "admin" };

const ICONS = {
  dashboard: LayoutDashboard,
  vehicles: Truck,
  defects: AlertTriangle,
  refill: PackagePlus,
  inspections: CalendarClock,
  checks: ClipboardCheck,
  warehouse: Boxes,
  material: Package,
  reports: BarChart3,
  users: Users,
  roles: ShieldCheck,
  settings: Settings,
  checklists: ClipboardList,
  audit: History,
  notifications: Bell,
  profile: User,
  sync: RefreshCw,
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, onClick }: { item: NavItem; pathname: string; onClick?: () => void }) {
  const Icon = ICONS[item.icon];
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        active ? "bg-drk-500 text-white" : "text-gray-300 hover:bg-anthracite-700 hover:text-white",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.badge ? <span className={clsx("rounded-full px-2 py-0.5 text-xs font-bold", active ? "bg-white text-drk-600" : "bg-drk-500 text-white")}>{item.badge}</span> : null}
    </Link>
  );
}

export function Sidebar({ items, footer }: { items: NavItem[]; footer: ReactNode }) {
  const pathname = usePathname();
  const main = items.filter((i) => i.section !== "admin");
  const admin = items.filter((i) => i.section === "admin");
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-anthracite-900 lg:flex">
      <Brand />
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Hauptnavigation">
        {main.map((i) => (
          <NavLink key={i.href} item={i} pathname={pathname} />
        ))}
        {admin.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wider text-gray-500">Administration</p>
            {admin.map((i) => (
              <NavLink key={i.href} item={i} pathname={pathname} />
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-anthracite-700 p-3">{footer}</div>
    </aside>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-5 py-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-drk-500 text-sm font-black text-white" aria-hidden>
        KW
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold text-white">KFZ-Warte</span>
        <span className="block text-xs text-gray-400">DRK Göhl</span>
      </span>
    </Link>
  );
}

/** Untere Navigationsleiste für Smartphones (große Touch-Flächen) + „Mehr“-Menü. */
export function BottomNav({ items, primary, footer }: { items: NavItem[]; primary: string[]; footer: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const prim = primary.map((h) => items.find((i) => i.href === h)).filter(Boolean) as NavItem[];
  return (
    <>
      <nav className="bottom-safe fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white lg:hidden" aria-label="Navigation">
        <ul className="grid grid-cols-5">
          {prim.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined} className={clsx("relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-drk-600" : "text-gray-600")}>
                  <Icon className="h-6 w-6" aria-hidden />
                  <span className="max-w-full truncate px-1">{item.label}</span>
                  {item.badge ? <span className="absolute right-[22%] top-1.5 min-w-5 rounded-full bg-drk-500 px-1 text-center text-[10px] font-bold text-white">{item.badge}</span> : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button onClick={() => setOpen(true)} className="flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-gray-600" aria-expanded={open}>
              <Menu className="h-6 w-6" aria-hidden />
              Mehr
            </button>
          </li>
        </ul>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menü">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="bottom-safe absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-anthracite-900 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-3 text-white" aria-label="Menü schließen">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-1">
              {items.map((i) => (
                <NavLink key={i.href} item={i} pathname={pathname} onClick={() => setOpen(false)} />
              ))}
            </div>
            <div className="mt-3 border-t border-anthracite-700 pt-3">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}

/** Abmelden: lokale Entwürfe und zwischengespeicherte Seiten werden vom Gerät entfernt. */
export function LogoutButton({ userId, className }: { userId: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  async function logout() {
    const drafts = await listDrafts(userId).catch(() => []);
    if (drafts.length > 0 && !window.confirm(`${drafts.length} Vorgang/Vorgänge sind noch nicht synchronisiert und gehen beim Abmelden verloren. Trotzdem abmelden?`)) return;
    setBusy(true);
    await clearDrafts().catch(() => undefined);
    navigator.serviceWorker?.controller?.postMessage({ type: "clear-user-data" });
    if ("caches" in window) await caches.delete("drk-pages").catch(() => undefined);
    await logoutAction();
  }
  return (
    <button type="button" onClick={logout} disabled={busy} className={clsx("focus-ring flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium", className ?? "text-gray-300 hover:bg-anthracite-700 hover:text-white")}>
      <LogOut className="h-5 w-5" aria-hidden /> {busy ? "Abmelden …" : "Abmelden"}
    </button>
  );
}
