import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { listDefects } from "@/server/services/defects";
import { summarizeVehicles } from "@/server/services/vehicles";
import { parseDate } from "@/server/page-helpers";
import { DefectTable } from "@/components/defect-table";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { DEFECT_CATEGORY, DEFECT_SEVERITY, DEFECT_STATUS } from "@/lib/labels";

export const metadata = { title: "Mängel" };

export default async function DefectsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const sp = await searchParams;
  const [defects, vehicles] = await Promise.all([
    listDefects(actor, { vehicleId: sp.vehicleId, status: sp.status ?? "open", severity: sp.severity, category: sp.category, q: sp.q, from: parseDate(sp.from), to: parseDate(sp.to, true) }),
    summarizeVehicles(actor),
  ]);
  const exportQs = new URLSearchParams({ ...sp, status: sp.status ?? "open" }).toString();
  return (
    <>
      <PageHeader
        title="Mängel"
        subtitle={`${defects.length} Einträge`}
        actions={
          <>
            {can(actor, "reports.view") && <LinkButton variant="secondary" href={`/api/export/maengel?format=csv&${exportQs}`} prefetch={false}>CSV</LinkButton>}
            {can(actor, "defects.report") && <LinkButton href="/maengel/neu">Mangel melden</LinkButton>}
          </>
        }
      />
      <form className="filterbar mb-4 grid gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
        <input name="q" defaultValue={sp.q} placeholder="Suche in Titel/Beschreibung" className="input" aria-label="Suche" />
        <select name="vehicleId" defaultValue={sp.vehicleId ?? ""} className="input" aria-label="Fahrzeug">
          <option value="">Alle Fahrzeuge</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? "open"} className="input" aria-label="Status">
          <option value="open">Alle offenen</option>
          <option value="all">Alle</option>
          {Object.entries(DEFECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="severity" defaultValue={sp.severity ?? ""} className="input" aria-label="Schweregrad">
          <option value="">Alle Schweregrade</option>
          {Object.entries(DEFECT_SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className="input" aria-label="Kategorie">
          <option value="">Alle Kategorien</option>
          {Object.entries(DEFECT_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="text-sm">
          <span className="sr-only">Von</span>
          <input type="date" name="from" defaultValue={sp.from} className="input" aria-label="Gemeldet ab" />
        </label>
        <label className="text-sm">
          <span className="sr-only">Bis</span>
          <input type="date" name="to" defaultValue={sp.to} className="input" aria-label="Gemeldet bis" />
        </label>
        <button className="min-h-12 rounded-lg bg-drkblue-900 px-4 text-sm font-semibold text-white hover:bg-drkblue-600">Filtern</button>
      </form>
      <Card padded={false}>
        <DefectTable defects={defects} />
      </Card>
    </>
  );
}
