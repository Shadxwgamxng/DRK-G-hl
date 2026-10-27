import { requireActiveActor } from "@/server/auth/current";
import { listAuditLogs } from "@/server/services/admin";
import { parseDate } from "@/server/page-helpers";
import { Alert, Card, PageHeader } from "@/components/ui";
import { AuditTable } from "@/components/audit-table";
import { AUDIT_ACTION } from "@/lib/labels";

export const metadata = { title: "Änderungsprotokoll" };

const ENTITY = ["User", "Role", "Vehicle", "VehicleCheck", "Inspection", "VehicleMaterialStock", "WarehouseStock", "RefillRequest", "Defect", "Attachment", "Setting", "Checklist", "Material"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("audit.view");
  const sp = await searchParams;
  const logs = await listAuditLogs(actor, { entityType: sp.entityType || undefined, action: sp.action || undefined, from: parseDate(sp.from), to: parseDate(sp.to, true) }, 500);
  return (
    <>
      <PageHeader title="Änderungsprotokoll" subtitle="Revisionssicher – Einträge können weder geändert noch gelöscht werden (Datenbank-Trigger)." />
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-5">
        <select name="entityType" defaultValue={sp.entityType ?? ""} className="input" aria-label="Datensatztyp">
          <option value="">Alle Datensätze</option>
          {ENTITY.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select name="action" defaultValue={sp.action ?? ""} className="input" aria-label="Aktion">
          <option value="">Alle Aktionen</option>
          {Object.entries(AUDIT_ACTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.from} className="input" aria-label="Von" />
        <input type="date" name="to" defaultValue={sp.to} className="input" aria-label="Bis" />
        <button className="min-h-12 rounded-lg bg-anthracite-800 px-4 text-sm font-semibold text-white">Filtern</button>
      </form>
      {logs.length === 500 && <Alert tone="info" className="mb-3" title="Es werden die neuesten 500 Einträge angezeigt. Filter verwenden, um ältere Einträge zu finden." />}
      <Card padded={false}><AuditTable logs={logs} showIp /></Card>
    </>
  );
}
