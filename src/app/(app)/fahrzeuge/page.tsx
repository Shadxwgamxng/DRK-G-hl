import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import type { Prisma, VehicleStatus } from "@prisma/client";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { listVehicleTypes, summarizeVehicles } from "@/server/services/vehicles";
import { EmptyState, LinkButton, PageHeader, TableWrap } from "@/components/ui";
import { DueBadge, VehicleStatusBadge } from "@/components/status";
import { VehicleCards } from "@/components/vehicle-cards";
import { daysUntil, fmtDate } from "@/lib/format";
import { VEHICLE_STATUS } from "@/lib/labels";

export const metadata = { title: "Fahrzeuge" };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const sp = await searchParams;
  const where: Prisma.VehicleWhereInput = {};
  if (sp.status && sp.status in VEHICLE_STATUS) where.status = sp.status as VehicleStatus;
  if (sp.typeId) where.typeId = sp.typeId;
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { licensePlate: { contains: sp.q, mode: "insensitive" } }, { radioCallSign: { contains: sp.q, mode: "insensitive" } }];
  const [vehicles, types] = await Promise.all([summarizeVehicles(actor, { where, includeArchived: sp.archiv === "1" }), listVehicleTypes()]);
  const view = sp.ansicht === "tabelle" ? "tabelle" : "karten";
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...sp, ...patch } as Record<string, string>);
    for (const [k, v] of [...p.entries()]) if (!v || v === "undefined") p.delete(k);
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Fahrzeuge"
        subtitle={`${vehicles.length} Fahrzeug(e)`}
        actions={can(actor, "vehicles.manage") && (
          <LinkButton href="/fahrzeuge/neu">
            <Plus className="h-5 w-5" aria-hidden /> Fahrzeug anlegen
          </LinkButton>
        )}
      />
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Name, Kennzeichen, Funkrufname" className="input lg:col-span-2" aria-label="Suche" />
        <select name="status" defaultValue={sp.status ?? ""} className="input" aria-label="Status">
          <option value="">Alle Status</option>
          {Object.entries(VEHICLE_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="typeId" defaultValue={sp.typeId ?? ""} className="input" aria-label="Fahrzeugtyp">
          <option value="">Alle Typen</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input type="hidden" name="ansicht" value={view} />
        <div className="flex gap-2">
          <button className="min-h-12 flex-1 rounded-lg bg-anthracite-800 px-4 text-sm font-semibold text-white">Filtern</button>
          <Link href="/fahrzeuge" className="flex min-h-12 items-center rounded-lg px-3 text-sm font-semibold text-gray-600 hover:bg-gray-100">
            Zurücksetzen
          </Link>
        </div>
      </form>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">Ansicht:</span>
        <Link href={qs({ ansicht: "karten" })} className={`rounded-lg px-3 py-2 font-semibold ${view === "karten" ? "bg-anthracite-800 text-white" : "bg-white"}`}>
          Karten
        </Link>
        <Link href={qs({ ansicht: "tabelle" })} className={`rounded-lg px-3 py-2 font-semibold ${view === "tabelle" ? "bg-anthracite-800 text-white" : "bg-white"}`}>
          Tabelle
        </Link>
        {can(actor, "vehicles.manage") && (
          <Link href={qs({ archiv: sp.archiv === "1" ? undefined : "1" })} className="ml-auto rounded-lg px-3 py-2 font-semibold text-gray-600 hover:bg-white">
            {sp.archiv === "1" ? "Archivierte ausblenden" : "Archivierte anzeigen"}
          </Link>
        )}
      </div>

      {vehicles.length === 0 ? (
        <EmptyState icon={<Truck className="h-12 w-12" />} title="Keine Fahrzeuge gefunden">
          {sp.q || sp.status || sp.typeId ? "Passen Sie die Filter an." : "Es sind noch keine Fahrzeuge vorhanden bzw. Ihnen zugewiesen."}
        </EmptyState>
      ) : view === "karten" ? (
        <VehicleCards vehicles={vehicles} />
      ) : (
        <div className="card">
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fahrzeug</th>
                  <th>Status</th>
                  <th>Letzte Kontrolle</th>
                  <th>Nächste Kontrolle</th>
                  <th>Nächste HU</th>
                  <th>Nächste Wartung</th>
                  <th className="text-right">Mängel</th>
                  <th className="text-right">Fehlend</th>
                  <th className="text-right">Verfall</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/fahrzeuge/${v.id}`} className="font-semibold hover:text-drk-600">
                        {v.name}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {v.licensePlate} · {v.type.name}
                      </div>
                    </td>
                    <td>
                      <VehicleStatusBadge status={v.status} />
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(v.lastCheck?.performedAt)}</td>
                    <td>{v.nextCheckDue ? <DueBadge date={v.nextCheckDue} days={v.nextCheckInDays} warnDays={1} /> : <span className="text-drk-700">ausstehend</span>}</td>
                    <td>{v.nextHu ? <DueBadge date={v.nextHu.dueDate} days={daysUntil(v.nextHu.dueDate)} /> : "–"}</td>
                    <td>{v.nextMaintenance ? <DueBadge date={v.nextMaintenance.dueDate} days={daysUntil(v.nextMaintenance.dueDate)} /> : "–"}</td>
                    <td className="text-right tabular-nums">
                      {v.openDefects}
                      {v.criticalDefects > 0 && <span className="ml-1 font-bold text-drk-600">({v.criticalDefects}!)</span>}
                    </td>
                    <td className="text-right tabular-nums">{v.missingMaterials}</td>
                    <td className="text-right tabular-nums">
                      <span className={v.expiredBatches ? "font-bold text-drk-600" : ""}>{v.expiredBatches}</span> / {v.expiringBatches}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}
    </>
  );
}
