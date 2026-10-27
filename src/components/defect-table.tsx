import Link from "next/link";
import { AlertTriangle, Paperclip } from "lucide-react";
import { DefectStatusBadge, SeverityBadge } from "./status";
import { EmptyState, TableWrap } from "./ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { DEFECT_CATEGORY } from "@/lib/labels";

type Row = {
  id: string;
  title: string;
  severity: string;
  status: string;
  category: string;
  reportedAt: Date;
  dueDate: Date | null;
  vehicle: { id: string; name: string };
  reportedBy: { firstName: string; lastName: string };
  assignedTo: { firstName: string; lastName: string } | null;
  _count: { attachments: number };
};

export function DefectTable({ defects, showVehicle = true }: { defects: Row[]; showVehicle?: boolean }) {
  if (defects.length === 0) return <div className="p-4"><EmptyState icon={<AlertTriangle className="h-10 w-10" />} title="Keine Mängel gefunden" /></div>;
  return (
    <TableWrap>
      <table className="table-base">
        <thead>
          <tr>
            <th>Mangel</th>
            {showVehicle && <th>Fahrzeug</th>}
            <th>Schweregrad</th>
            <th>Status</th>
            <th>Gemeldet</th>
            <th>Zuständig</th>
            <th>Frist</th>
          </tr>
        </thead>
        <tbody>
          {defects.map((d) => (
            <tr key={d.id} className={d.severity === "CRITICAL" && d.status !== "CLOSED" ? "bg-drk-50/60" : undefined}>
              <td>
                <Link href={`/maengel/${d.id}`} className="font-semibold hover:text-drkblue-600">{d.title}</Link>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  {DEFECT_CATEGORY[d.category]}
                  {d._count.attachments > 0 && (<><Paperclip className="ml-1 h-3 w-3" aria-hidden /> {d._count.attachments}</>)}
                </div>
              </td>
              {showVehicle && <td><Link href={`/fahrzeuge/${d.vehicle.id}`} className="hover:text-drkblue-600">{d.vehicle.name}</Link></td>}
              <td><SeverityBadge severity={d.severity} /></td>
              <td><DefectStatusBadge status={d.status} /></td>
              <td className="whitespace-nowrap">{fmtDateTime(d.reportedAt)}<div className="text-xs text-gray-500">{d.reportedBy.firstName} {d.reportedBy.lastName}</div></td>
              <td>{d.assignedTo ? `${d.assignedTo.firstName} ${d.assignedTo.lastName}` : "–"}</td>
              <td className={d.dueDate && d.dueDate < new Date() && d.status !== "CLOSED" && d.status !== "RESOLVED" ? "font-semibold text-drk-700" : ""}>{fmtDate(d.dueDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
