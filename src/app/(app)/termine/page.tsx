import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { listInspections, listInspectionTypes } from "@/server/services/inspections";
import { summarizeVehicles } from "@/server/services/vehicles";
import { Card, EmptyState, LinkButton, PageHeader, TableWrap } from "@/components/ui";
import { DueBadge } from "@/components/status";
import { fmtDate } from "@/lib/format";
import { INTERVAL_UNIT } from "@/lib/labels";

export const metadata = { title: "Prüfungen & Termine" };

export default async function InspectionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("inspections.view");
  const sp = await searchParams;
  const [list, types, vehicles] = await Promise.all([listInspections(actor, { vehicleId: sp.vehicleId, state: sp.state, typeId: sp.typeId }), listInspectionTypes(), summarizeVehicles(actor)]);
  return (
    <>
      <PageHeader
        title="Prüfungen & Termine"
        subtitle="TÜV (HU/SP), Wartungen und Geräteprüfungen aller sichtbaren Fahrzeuge"
        actions={<LinkButton variant="secondary" href={`/api/export/termine?format=pdf${sp.vehicleId ? `&vehicleId=${sp.vehicleId}` : ""}`} prefetch={false}>PDF-Übersicht</LinkButton>}
      />
      <form className="filterbar mb-4 grid gap-3 p-3 sm:grid-cols-4">
        <select name="vehicleId" defaultValue={sp.vehicleId ?? ""} className="input" aria-label="Fahrzeug">
          <option value="">Alle Fahrzeuge</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select name="typeId" defaultValue={sp.typeId ?? ""} className="input" aria-label="Art">
          <option value="">Alle Arten</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select name="state" defaultValue={sp.state ?? ""} className="input" aria-label="Status">
          <option value="">Alle</option>
          <option value="overdue">Überfällig</option>
          <option value="due_soon">Bald fällig</option>
          <option value="ok">Im Plan</option>
        </select>
        <button className="min-h-12 rounded-lg bg-drkblue-900 px-4 text-sm font-semibold text-white hover:bg-drkblue-600">Filtern</button>
      </form>
      <Card padded={list.length === 0}>
        {list.length === 0 ? (
          <EmptyState icon={<CalendarClock className="h-10 w-10" />} title="Keine Termine gefunden">Termine werden auf der Fahrzeugseite unter „Prüfungen & Termine“ angelegt.</EmptyState>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Prüfung</th><th>Fahrzeug</th><th>Fällig</th><th>Zuletzt</th><th>Intervall</th><th>Zuständig</th></tr></thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} className={i.state === "overdue" ? "bg-drk-50/60" : undefined}>
                    <td><Link href={`/termine/${i.id}`} className="font-semibold hover:text-drkblue-600">{i.title}</Link><div className="text-xs text-gray-500">{i.type.name}</div></td>
                    <td><Link href={`/fahrzeuge/${i.vehicle.id}`} className="hover:text-drkblue-600">{i.vehicle.name}</Link></td>
                    <td><DueBadge date={i.dueDate} days={i.days} warnDays={Math.max(0, ...i.reminderDays)} /></td>
                    <td>{fmtDate(i.lastDate)}</td>
                    <td>{i.intervalValue ? `${i.intervalValue} ${INTERVAL_UNIT[i.intervalUnit!]}` : "einmalig"}</td>
                    <td>{i.assignedTo ? `${i.assignedTo.firstName} ${i.assignedTo.lastName}` : "–"}</td>
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
