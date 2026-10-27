import Link from "next/link";
import { AlertOctagon, AlertTriangle, ClipboardCheck, Package, PackageX } from "lucide-react";
import type { VehicleSummary } from "@/server/services/vehicles";
import { daysUntil, fmtDate, plate } from "@/lib/format";
import { CheckDue, DueBadge, VehicleStatusBadge } from "./status";
import { Badge } from "./ui";

const border: Record<string, string> = { READY: "border-l-green-600", LIMITED: "border-l-amber-500", NOT_READY: "border-l-drk-500", OUT_OF_SERVICE: "border-l-gray-400" };

export function VehicleCards({ vehicles }: { vehicles: VehicleSummary[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {vehicles.map((v) => (
        <li key={v.id}>
          <Link href={`/fahrzeuge/${v.id}`} className={`card focus-ring block border-l-4 p-4 transition-shadow hover:shadow-md ${border[v.status]}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{v.name}</p>
                <p className="text-sm text-gray-600">
                  {plate(v.licensePlate)} · {v.type.name}
                  {v.radioCallSign ? ` · ${v.radioCallSign}` : ""}
                </p>
              </div>
              <VehicleStatusBadge status={v.status} />
            </div>
            {v.archivedAt && <Badge tone="dark" className="mt-2">Archiviert</Badge>}
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Letzte Kontrolle</dt>
                <dd className="font-medium">{v.lastCheck ? fmtDate(v.lastCheck.performedAt) : <span className="text-drk-700">noch keine</span>}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Nächste Kontrolle</dt>
                <dd><CheckDue v={v} /></dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Nächster TÜV</dt>
                <dd>{v.nextHu ? <DueBadge date={v.nextHu.dueDate} days={daysUntil(v.nextHu.dueDate)} warnDays={Math.max(0, ...v.nextHu.reminderDays)} /> : <span className="text-gray-500">–</span>}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Nächste Wartung</dt>
                <dd>{v.nextMaintenance ? <DueBadge date={v.nextMaintenance.dueDate} days={daysUntil(v.nextMaintenance.dueDate)} warnDays={Math.max(0, ...v.nextMaintenance.reminderDays)} /> : <span className="text-gray-500">–</span>}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {v.criticalDefects > 0 && <Badge tone="red" icon={<AlertOctagon className="h-3.5 w-3.5" />}>{v.criticalDefects} kritisch</Badge>}
              <Badge tone={v.openDefects ? "orange" : "gray"} icon={<AlertTriangle className="h-3.5 w-3.5" />}>{v.openDefects} offene Mängel</Badge>
              <Badge tone={v.missingMaterials ? "orange" : "gray"} icon={<PackageX className="h-3.5 w-3.5" />}>{v.missingMaterials} fehlend</Badge>
              {v.expiredBatches > 0 && <Badge tone="red" icon={<Package className="h-3.5 w-3.5" />}>{v.expiredBatches} abgelaufen</Badge>}
              {v.expiringBatches > 0 && <Badge tone="yellow" icon={<Package className="h-3.5 w-3.5" />}>{v.expiringBatches} läuft bald ab</Badge>}
              {v.checkState !== "ok" && <Badge tone={v.checkState === "overdue" ? "red" : "yellow"} icon={<ClipboardCheck className="h-3.5 w-3.5" />}>{v.checkState === "overdue" ? "Kontrolle überfällig" : "Monatskontrolle offen"}</Badge>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
