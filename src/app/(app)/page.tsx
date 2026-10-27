import Link from "next/link";
import { AlertOctagon, AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Package, PackageX, Truck, UserPlus, Timer, PackagePlus, CircleSlash } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { dashboardData } from "@/server/services/dashboard";
import { Alert, Card, EmptyState, LinkButton, PageHeader, StatTile } from "@/components/ui";
import { DueBadge } from "@/components/status";
import { InstallHint } from "@/components/pwa";
import { VehicleCards } from "@/components/vehicle-cards";
import { daysUntil, fmtDate, fmtDateTime } from "@/lib/format";

export const metadata = { title: "Übersicht" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const sp = await searchParams;
  const d = await dashboardData(actor);
  const k = d.kpi;
  const admin = can(actor, "vehicles.view_all");

  return (
    <>
      <PageHeader title={`Guten Tag, ${actor.firstName}`} subtitle={admin ? "Gesamtübersicht aller Fahrzeuge" : "Übersicht Ihrer zugewiesenen Fahrzeuge"} />
      <InstallHint />
      {sp.fehler === "berechtigung" && <Alert tone="error" title="Für diese Seite fehlt Ihnen die Berechtigung." className="mb-4" />}

      {d.criticalDefects.length > 0 && (
        <div className="mb-5 rounded-xl border-2 border-drk-500 bg-drk-50 p-4" role="alert">
          <p className="flex items-center gap-2 text-lg font-bold text-drk-700">
            <AlertOctagon className="h-6 w-6" aria-hidden /> {d.criticalDefects.length} kritische(r) Mangel/Mängel offen
          </p>
          <ul className="mt-2 space-y-1">
            {d.criticalDefects.map((x) => (
              <li key={x.id}>
                <Link href={`/maengel/${x.id}`} className="font-semibold text-drk-800 underline">
                  {x.vehicle.name}: {x.title}
                </Link>{" "}
                <span className="text-sm text-drk-700">({fmtDateTime(x.reportedAt)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {k.vehiclesTotal === 0 ? (
        <EmptyState icon={<Truck className="h-12 w-12" />} title={admin ? "Noch keine Fahrzeuge angelegt" : "Ihnen ist noch kein Fahrzeug zugewiesen"} action={can(actor, "vehicles.manage") ? <LinkButton href="/fahrzeuge/neu">Fahrzeug anlegen</LinkButton> : undefined}>
          {admin ? "Legen Sie das erste Fahrzeug an, um Kontrollen, Termine und Material zu verwalten." : "Bitte wenden Sie sich an die Administration, damit Ihnen ein Fahrzeug zugewiesen wird."}
        </EmptyState>
      ) : (
        <>
          <h2 className="sr-only">Kennzahlen</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
            <StatTile label="Fahrzeuge" value={k.vehiclesTotal} icon={<Truck className="h-6 w-6" />} href="/fahrzeuge" />
            <StatTile label="Einsatzbereit" value={k.ready} tone="green" icon={<CheckCircle2 className="h-6 w-6" />} href="/fahrzeuge?status=READY" />
            <StatTile label="Eingeschränkt" value={k.limited} tone={k.limited ? "yellow" : "gray"} icon={<AlertTriangle className="h-6 w-6" />} href="/fahrzeuge?status=LIMITED" />
            <StatTile label="Nicht einsatzbereit" value={k.notReady} tone={k.notReady ? "red" : "gray"} icon={<AlertOctagon className="h-6 w-6" />} href="/fahrzeuge?status=NOT_READY" />
            <StatTile label="Außer Dienst" value={k.outOfService} icon={<CircleSlash className="h-6 w-6" />} href="/fahrzeuge?status=OUT_OF_SERVICE" />
            <StatTile label="Kontrollen heute fällig" value={k.checksDueToday} tone={k.checksDueToday ? "yellow" : "gray"} icon={<ClipboardCheck className="h-6 w-6" />} />
            <StatTile label="Kontrollen überfällig" value={k.checksOverdue} tone={k.checksOverdue ? "red" : "gray"} icon={<Timer className="h-6 w-6" />} />
            {can(actor, "inspections.view") && <StatTile label="HU/Wartung (30 Tage)" value={k.upcomingInspections} tone={k.overdueInspections ? "red" : k.upcomingInspections ? "yellow" : "gray"} hint={k.overdueInspections ? `${k.overdueInspections} überfällig` : undefined} icon={<CalendarClock className="h-6 w-6" />} href="/termine" />}
            <StatTile label="Offene Mängel" value={k.openDefects} tone={k.openDefects ? "orange" : "gray"} icon={<AlertTriangle className="h-6 w-6" />} href="/maengel" />
            <StatTile label="Kritische Mängel" value={k.criticalDefects} tone={k.criticalDefects ? "red" : "gray"} icon={<AlertOctagon className="h-6 w-6" />} href="/maengel?severity=CRITICAL" />
            {can(actor, "materials.view") && (
              <>
                <StatTile label="Fehlende Materialien" value={k.missingMaterials} tone={k.missingMaterials ? "orange" : "gray"} hint="Positionen unter Soll" icon={<PackageX className="h-6 w-6" />} />
                <StatTile label="Abgelaufen" value={k.expiredBatches} tone={k.expiredBatches ? "red" : "gray"} hint="Chargen" icon={<Package className="h-6 w-6" />} href="/berichte?typ=verfall" />
                <StatTile label={`Ablauf ≤ ${d.expiryWarningDays} Tage`} value={k.expiringBatches} tone={k.expiringBatches ? "yellow" : "gray"} hint="Chargen" icon={<Package className="h-6 w-6" />} href="/berichte?typ=verfall" />
              </>
            )}
            <StatTile label="Offene Nachfüllungen" value={k.openRefills} tone={k.openRefills ? "blue" : "gray"} icon={<PackagePlus className="h-6 w-6" />} href="/nachfuellung" />
            {can(actor, "users.manage") && <StatTile label="Freigaben ausstehend" value={k.pendingUsers} tone={k.pendingUsers ? "red" : "gray"} icon={<UserPlus className="h-6 w-6" />} href="/admin/benutzer?status=PENDING" />}
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            <Card title="Fällige Fahrzeugkontrollen">
              {d.checksDue.length === 0 ? (
                <p className="text-sm text-gray-600">Alle Fahrzeuge sind im Kontrollintervall.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {d.checksDue.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div>
                        <Link href={`/fahrzeuge/${v.id}`} className="font-semibold hover:text-drk-600">
                          {v.name}
                        </Link>
                        <p className="text-xs text-gray-500">{v.lastCheck ? `Zuletzt ${fmtDate(v.lastCheck.performedAt)} (${v.lastCheck.performedBy.firstName} ${v.lastCheck.performedBy.lastName})` : "Noch nie kontrolliert"}</p>
                      </div>
                      {can(actor, "checks.perform") && (
                        <LinkButton href={`/fahrzeuge/${v.id}/kontrolle`} size="sm">
                          Kontrolle starten
                        </LinkButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {can(actor, "inspections.view") && (
              <Card title="Anstehende HU-, Prüf- und Wartungstermine" actions={<Link href="/termine" className="text-sm font-semibold text-drk-600">Alle</Link>}>
                {d.upcomingInspections.length === 0 ? (
                  <p className="text-sm text-gray-600">Keine Termine in den nächsten 30 Tagen.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {d.upcomingInspections.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div>
                          <Link href={`/termine/${i.id}`} className="font-semibold hover:text-drk-600">
                            {i.title}
                          </Link>
                          <p className="text-xs text-gray-500">{i.vehicle.name}</p>
                        </div>
                        <DueBadge date={i.dueDate} days={daysUntil(i.dueDate)} warnDays={Math.max(0, ...i.reminderDays)} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          <h2 className="mb-3 mt-8 text-lg font-bold">Fahrzeuge</h2>
          <VehicleCards vehicles={d.vehicles} />
        </>
      )}
    </>
  );
}

