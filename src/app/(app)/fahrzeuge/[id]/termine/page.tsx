import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { listInspections, listInspectionTypes } from "@/server/services/inspections";
import { assignableUsers } from "@/server/services/vehicles";
import { Card, EmptyState, TableWrap } from "@/components/ui";
import { DueBadge } from "@/components/status";
import { InspectionForm } from "@/components/inspection-form";
import { createInspectionAction } from "@/app/actions/inspections";
import { fmtDate } from "@/lib/format";
import { INTERVAL_UNIT } from "@/lib/labels";

export default async function VehicleInspections({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActiveActor("inspections.view");
  const { id } = await params;
  const list = await listInspections(actor, { vehicleId: id });
  const manage = can(actor, "inspections.manage");
  const [types, users] = manage ? await Promise.all([listInspectionTypes(), assignableUsers()]) : [[], []];
  return (
    <div className="space-y-5">
      <Card title="Prüf- und Wartungstermine" padded={list.length === 0}>
        {list.length === 0 ? (
          <EmptyState icon={<CalendarClock className="h-10 w-10" />} title="Keine Termine geplant">Legen Sie HU, Wartungen und Geräteprüfungen mit individuellen Intervallen an.</EmptyState>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Prüfung</th><th>Fällig</th><th>Zuletzt</th><th>Intervall</th><th>Zuständig</th><th>Werkstatt</th></tr></thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/termine/${i.id}`} className="font-semibold hover:text-drk-600">{i.title}</Link><div className="text-xs text-gray-500">{i.type.name}</div></td>
                    <td><DueBadge date={i.dueDate} days={i.days} warnDays={Math.max(0, ...i.reminderDays)} /></td>
                    <td>{fmtDate(i.lastDate)}</td>
                    <td>{i.intervalValue ? `${i.intervalValue} ${INTERVAL_UNIT[i.intervalUnit!]}` : "einmalig"}</td>
                    <td>{i.assignedTo ? `${i.assignedTo.firstName} ${i.assignedTo.lastName}` : "–"}</td>
                    <td>{i.workshop ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      {manage && (
        <Card title="Neuen Termin anlegen">
          <InspectionForm action={createInspectionAction.bind(null, id)} types={types} users={users} submitLabel="Termin anlegen" />
        </Card>
      )}
    </div>
  );
}
