import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { listChecks } from "@/server/services/checks";
import { summarizeVehicles } from "@/server/services/vehicles";
import { parseDate } from "@/server/page-helpers";
import { Badge, Card, EmptyState, LinkButton, PageHeader, TableWrap } from "@/components/ui";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { CHECK_OUTCOME, CHECK_TYPE } from "@/lib/labels";

export const metadata = { title: "Kontrollen" };

export default async function ChecksPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const sp = await searchParams;
  const [checks, vehicles] = await Promise.all([listChecks(actor, { vehicleId: sp.vehicleId, from: parseDate(sp.from), to: parseDate(sp.to, true) }, 300), summarizeVehicles(actor)]);
  const qs = new URLSearchParams(sp).toString();
  return (
    <>
      <PageHeader
        title="Fahrzeugkontrollen"
        actions={can(actor, "reports.view") && <><LinkButton variant="secondary" href={`/api/export/kontrollen?format=pdf&${qs}`} prefetch={false}>PDF</LinkButton><LinkButton variant="secondary" href={`/api/export/kontrollen?format=csv&${qs}`} prefetch={false}>CSV</LinkButton></>}
      />
      {can(actor, "checks.perform") && vehicles.length > 0 && (
        <Card title="Kontrolle starten" className="mb-4">
          <div className="flex flex-wrap gap-2">
            {vehicles.filter((v) => !v.archivedAt).map((v) => <LinkButton key={v.id} href={`/fahrzeuge/${v.id}/kontrolle`} variant="secondary">{v.name}</LinkButton>)}
          </div>
        </Card>
      )}
      <form className="filterbar mb-4 grid gap-3 p-3 sm:grid-cols-4">
        <select name="vehicleId" defaultValue={sp.vehicleId ?? ""} className="input" aria-label="Fahrzeug">
          <option value="">Alle Fahrzeuge</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.from} className="input" aria-label="Von" />
        <input type="date" name="to" defaultValue={sp.to} className="input" aria-label="Bis" />
        <button className="min-h-12 rounded-lg bg-drkblue-900 px-4 text-sm font-semibold text-white hover:bg-drkblue-600">Filtern</button>
      </form>
      <Card padded={checks.length === 0}>
        {checks.length === 0 ? <EmptyState icon={<ClipboardCheck className="h-10 w-10" />} title="Keine Kontrollen gefunden" /> : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Datum</th><th>Fahrzeug</th><th>Kontrollart</th><th>Prüfer</th><th>km</th><th>Ergebnis</th></tr></thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap"><Link href={`/fahrzeuge/${c.vehicle.id}/kontrollen/${c.id}`} className="font-semibold hover:text-drkblue-600">{fmtDateTime(c.performedAt)}</Link></td>
                    <td>{c.vehicle.name}</td>
                    <td>{CHECK_TYPE[c.checkType]}</td>
                    <td>{c.performedBy.firstName} {c.performedBy.lastName}</td>
                    <td>{fmtNumber(c.mileage)}</td>
                    <td><Badge tone={c.outcome === "OK" ? "green" : "red"}>{CHECK_OUTCOME[c.outcome]}</Badge></td>
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
