import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { listMovements, locationOptions } from "@/server/services/warehouse";
import { summarizeVehicles } from "@/server/services/vehicles";
import { parseDate } from "@/server/page-helpers";
import { Card, LinkButton, PageHeader, TableWrap } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { MOVEMENT_REASON, MOVEMENT_TYPE } from "@/lib/labels";

export const metadata = { title: "Lagerbewegungen" };

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const sp = await searchParams;
  const [rows, vehicles, locations] = await Promise.all([
    listMovements(actor, { vehicleId: sp.vehicleId, type: sp.type && sp.type in MOVEMENT_TYPE ? sp.type : undefined, locationId: sp.locationId, from: parseDate(sp.from), to: parseDate(sp.to, true) }),
    summarizeVehicles(actor),
    can(actor, "warehouse.view") ? locationOptions() : Promise.resolve([]),
  ]);
  const qs = new URLSearchParams(sp).toString();
  return (
    <>
      <PageHeader
        title="Lagerbewegungen"
        subtitle="Jede Bestandsänderung wird unveränderlich protokolliert"
        back={{ href: "/lager", label: "Zentrallager" }}
        actions={can(actor, "reports.view") && <><LinkButton variant="secondary" href={`/api/export/bewegungen?format=csv&${qs}`} prefetch={false}>CSV</LinkButton><LinkButton variant="secondary" href={`/api/export/bewegungen?format=pdf&${qs}`} prefetch={false}>PDF</LinkButton></>}
      />
      <form className="filterbar mb-4 grid gap-3 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <select name="vehicleId" defaultValue={sp.vehicleId ?? ""} className="input" aria-label="Fahrzeug">
          <option value="">Alle Fahrzeuge</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className="input" aria-label="Art">
          <option value="">Alle Arten</option>
          {Object.entries(MOVEMENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="locationId" defaultValue={sp.locationId ?? ""} className="input" aria-label="Lagerort">
          <option value="">Alle Lagerorte</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.warehouse.name} – {l.name}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.from} className="input" aria-label="Von" />
        <input type="date" name="to" defaultValue={sp.to} className="input" aria-label="Bis" />
        <button className="min-h-12 rounded-lg bg-drkblue-900 px-4 text-sm font-semibold text-white hover:bg-drkblue-600">Filtern</button>
      </form>
      <Card padded={rows.length === 0}>
        {rows.length === 0 ? <p className="text-sm text-gray-600">Keine Bewegungen gefunden.</p> : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Zeitpunkt</th><th>Art</th><th>Material</th><th className="text-right">Menge</th><th>Von</th><th>Nach</th><th>Verfall / Ch.</th><th>Benutzer</th><th>Bemerkung</th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(m.createdAt)}</td>
                    <td>{MOVEMENT_TYPE[m.type]}{m.reason ? <div className="text-xs text-gray-500">{MOVEMENT_REASON[m.reason]}</div> : null}</td>
                    <td>{m.material.name}</td>
                    <td className="text-right tabular-nums">{Math.abs(m.quantity)} {m.material.unit}</td>
                    <td>{m.fromVehicleStock ? m.fromVehicleStock.vehicle.name : m.fromWarehouseStock ? `${m.fromWarehouseStock.location.warehouse.name} – ${m.fromWarehouseStock.location.name}` : "–"}</td>
                    <td>{m.toVehicleStock ? m.toVehicleStock.vehicle.name : m.toWarehouseStock ? `${m.toWarehouseStock.location.warehouse.name} – ${m.toWarehouseStock.location.name}` : m.type === "WRITE_OFF" || m.type === "ISSUE" ? "Ausgebucht" : "–"}</td>
                    <td className="whitespace-nowrap">{m.batchNumber ?? ""}{m.expiryDate ? ` (${fmtDate(m.expiryDate)})` : ""}</td>
                    <td>{m.user.firstName} {m.user.lastName}</td>
                    <td className="max-w-xs">{m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
