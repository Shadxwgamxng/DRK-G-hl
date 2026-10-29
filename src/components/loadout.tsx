import Link from "next/link";
import { Archive, Backpack, Boxes, Briefcase, ChevronRight, FolderOpen, Inbox, MapPin, Package, Rows3 } from "lucide-react";
import { Badge, TableWrap } from "./ui";
import { RefillStatusBadge } from "./status";
import { fmtDate } from "@/lib/format";
import { COMPARTMENT_KIND } from "@/lib/labels";

const ICONS = { CABINET: Archive, DRAWER: Inbox, BACKPACK: Backpack, BAG: Briefcase, BOX: Package, SHELF: Rows3, COMPARTMENT: FolderOpen, OTHER: Boxes } as const;

export function KindIcon({ kind, className = "h-6 w-6" }: { kind: string; className?: string }) {
  const Icon = ICONS[kind as keyof typeof ICONS] ?? Boxes;
  return <Icon className={className} aria-hidden />;
}

export type StockRow = {
  id: string;
  compartment: string | null;
  currentQuantity: number;
  targetQuantity: number;
  minQuantity: number;
  missing: number;
  belowMin: boolean;
  expiredQty: number;
  expiringQty: number;
  nextExpiry: Date | null;
  activeRefill: { status: string } | null;
  material: { name: string; unit: string; articleNumber: string | null; isNarcotic: boolean; isEquipment: boolean };
};

export type LocationStats = { positions: number; missing: number; expired: number; expiring: number };

export function statsOf(rows: StockRow[]): LocationStats {
  return {
    positions: rows.length,
    missing: rows.filter((s) => s.missing > 0).length,
    expired: rows.filter((s) => s.expiredQty > 0).length,
    expiring: rows.filter((s) => s.expiringQty > 0).length,
  };
}

export function StatsBadges({ s }: { s: LocationStats }) {
  return (
    <div className="flex flex-wrap gap-1">
      {s.expired > 0 && <Badge tone="red">{s.expired} abgelaufen</Badge>}
      {s.missing > 0 && <Badge tone="orange">{s.missing} unter Soll</Badge>}
      {s.expiring > 0 && <Badge tone="yellow">{s.expiring} läuft bald ab</Badge>}
      {s.positions > 0 && !s.expired && !s.missing && !s.expiring && <Badge tone="green">vollständig</Badge>}
    </div>
  );
}

/** Kachel für einen Schrank/Behälter oder ein Fach. */
/** Beschreibung / Ortshinweis eines Schranks oder Fachs. */
export function LocationHint({ texts, compact = false }: { texts: (string | null | undefined | false)[]; compact?: boolean }) {
  const lines = texts.filter(Boolean) as string[];
  if (!lines.length) return null;
  return (
    <div className={compact ? "mt-1 flex gap-1.5 text-xs text-gray-600" : "flex gap-2 rounded-sm border border-drkblue-300 bg-drkblue-50 px-3 py-2 text-sm text-drkblue-900"}>
      <MapPin className={compact ? "mt-0.5 h-3.5 w-3.5 shrink-0" : "mt-0.5 h-4 w-4 shrink-0"} aria-hidden />
      <div className="whitespace-pre-line">{lines.join("\n")}</div>
    </div>
  );
}

export function LocationCard({ href, name, kind, detail, stats, description }: { href: string; name: string; kind: string; detail: string; stats: LocationStats; description?: string | null }) {
  return (
    <Link href={href} className="card group flex min-h-24 items-start gap-3 p-4 hover:border-drkblue-300 hover:bg-drkblue-50/40">
      <span className="mt-0.5 text-drkblue-900"><KindIcon kind={kind} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-gray-800 group-hover:text-drkblue-700">{name}</span>
        <span className="block text-xs text-gray-500">{COMPARTMENT_KIND[kind] ?? kind} · {detail}</span>
        {description && <span className="mt-1 line-clamp-2 block text-xs text-drkblue-900">{description}</span>}
        <span className="mt-2 block"><StatsBadges s={stats} /></span>
      </span>
      <ChevronRight className="mt-1 h-5 w-5 text-gray-400" aria-hidden />
    </Link>
  );
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Lagerort" className="flex flex-wrap items-center gap-1 text-sm">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden />}
          {it.href ? <Link href={it.href} className="font-semibold text-drkblue-700 hover:underline">{it.label}</Link> : <span className="font-bold text-gray-800">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function StockTable({ rows, vehicleId, showLocation = false }: { rows: StockRow[]; vehicleId: string; showLocation?: boolean }) {
  return (
    <TableWrap>
      <table className="table-base">
        <thead>
          <tr>
            <th>Material</th>
            {showLocation && <th>Lagerort</th>}
            <th className="text-right">Ist / Soll</th>
            <th>Zustand</th>
            <th>Nächster Verfall</th>
            <th>Nachfüllung</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>
                <Link href={`/fahrzeuge/${vehicleId}/material/${s.id}`} className="font-semibold hover:text-drkblue-600">{s.material.name}</Link>
                {s.material.isNarcotic && <Badge tone="red" className="ml-2">BtM</Badge>}
                {s.material.isEquipment && <Badge className="ml-2">Gerät</Badge>}
                {s.material.articleNumber && <div className="text-xs text-gray-500">Art.-Nr. {s.material.articleNumber}</div>}
              </td>
              {showLocation && <td>{s.compartment ?? "–"}</td>}
              <td className="whitespace-nowrap text-right tabular-nums">
                <span className={s.missing ? "font-bold text-drk-600" : "font-semibold"}>{s.currentQuantity}</span> / {s.targetQuantity} {s.material.unit}
                <div className="text-xs text-gray-500">Min. {s.minQuantity}</div>
              </td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {s.belowMin && <Badge tone="red">unter Mindestbestand</Badge>}
                  {s.missing > 0 && !s.belowMin && <Badge tone="orange">{s.missing} fehlen</Badge>}
                  {s.expiredQty > 0 && <Badge tone="red">{s.expiredQty} abgelaufen</Badge>}
                  {s.expiringQty > 0 && <Badge tone="yellow">{s.expiringQty} läuft bald ab</Badge>}
                  {!s.missing && !s.expiredQty && !s.expiringQty && <Badge tone="green">OK</Badge>}
                </div>
              </td>
              <td className="whitespace-nowrap">{fmtDate(s.nextExpiry)}</td>
              <td>{s.activeRefill ? <RefillStatusBadge status={s.activeRefill.status} /> : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
