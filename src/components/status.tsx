import { AlertOctagon, AlertTriangle, CheckCircle2, CircleSlash, Clock } from "lucide-react";
import { Badge, type Tone } from "./ui";
import { DEFECT_SEVERITY, DEFECT_STATUS, REFILL_STATUS, VEHICLE_STATUS } from "@/lib/labels";
import { fmtDate, relativeDays } from "@/lib/format";

const vehicleTone: Record<string, Tone> = { READY: "green", LIMITED: "yellow", NOT_READY: "red", OUT_OF_SERVICE: "gray" };
const vehicleIcon: Record<string, React.ReactNode> = {
  READY: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />,
  LIMITED: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
  NOT_READY: <AlertOctagon className="h-3.5 w-3.5" aria-hidden />,
  OUT_OF_SERVICE: <CircleSlash className="h-3.5 w-3.5" aria-hidden />,
};

export function VehicleStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={vehicleTone[status]} icon={vehicleIcon[status]}>
      {VEHICLE_STATUS[status]}
    </Badge>
  );
}

const sevTone: Record<string, Tone> = { LOW: "gray", MEDIUM: "yellow", HIGH: "orange", CRITICAL: "red" };
export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge tone={sevTone[severity]} icon={severity === "CRITICAL" ? <AlertOctagon className="h-3.5 w-3.5" aria-hidden /> : undefined} className={severity === "CRITICAL" ? "uppercase" : undefined}>
      {DEFECT_SEVERITY[severity]}
    </Badge>
  );
}

const defectTone: Record<string, Tone> = { NEW: "red", REVIEWED: "orange", IN_PROGRESS: "blue", WAITING_PARTS: "yellow", RESOLVED: "green", CLOSED: "gray" };
export function DefectStatusBadge({ status }: { status: string }) {
  return <Badge tone={defectTone[status]}>{DEFECT_STATUS[status]}</Badge>;
}

const refillTone: Record<string, Tone> = { OPEN: "red", IN_PROGRESS: "blue", PROVIDED: "yellow", REFILLED: "green", DONE: "gray", CANCELLED: "gray" };
export function RefillStatusBadge({ status }: { status: string }) {
  return <Badge tone={refillTone[status]}>{REFILL_STATUS[status]}</Badge>;
}

/** Fälligkeitsanzeige: überfällig rot, bald fällig gelb, sonst neutral. */
export function DueBadge({ date, days, warnDays = 30, emptyText = "nicht geplant" }: { date: Date | null | undefined; days: number | null | undefined; warnDays?: number; emptyText?: string }) {
  if (!date || days == null) return <span className="text-sm text-gray-500">{emptyText}</span>;
  const tone: Tone = days < 0 ? "red" : days <= warnDays ? "yellow" : "green";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-medium tabular-nums">{fmtDate(date)}</span>
      <Badge tone={tone} icon={days < 0 ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <Clock className="h-3 w-3" aria-hidden />}>
        {days < 0 ? `überfällig ${relativeDays(days)}` : relativeDays(days)}
      </Badge>
    </span>
  );
}

export function ExpiryBadge({ date }: { date: Date | null | undefined; }) {
  if (!date) return <span className="text-gray-500">–</span>;
  const days = Math.round((new Date(date).getTime() - Date.now()) / 86400000);
  const tone: Tone = days < 0 ? "red" : days <= 30 ? "yellow" : "gray";
  return <Badge tone={tone}>{days < 0 ? `abgelaufen ${fmtDate(date)}` : fmtDate(date)}</Badge>;
}
