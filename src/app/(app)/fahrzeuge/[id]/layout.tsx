import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { assertVehicleAccess } from "@/server/access";
import { notFoundOnError } from "@/server/page-helpers";
import { VehicleTabs } from "@/components/vehicle-tabs";
import { VehicleStatusBadge } from "@/components/status";
import { Badge } from "@/components/ui";

export default async function VehicleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const actor = await requireActiveActor();
  const { id } = await params;
  const v = await notFoundOnError(() => assertVehicleAccess(actor, id));
  const tabs = [
    { href: "", label: "Übersicht" },
    { href: "/kontrollen", label: "Kontrollen" },
    ...(can(actor, "materials.view") ? [{ href: "/material", label: "Material" }] : []),
    ...(can(actor, "inspections.view") ? [{ href: "/termine", label: "Prüfungen & Termine" }] : []),
    { href: "/maengel", label: "Mängel" },
    ...(can(actor, "audit.view") || can(actor, "reports.view") ? [{ href: "/historie", label: "Historie" }] : []),
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{v.name}</h1>
        <VehicleStatusBadge status={v.status} />
        {v.archivedAt && <Badge tone="dark">Archiviert</Badge>}
      </div>
      <p className="-mt-2 mb-3 text-sm text-gray-600">
        {v.licensePlate}
        {v.radioCallSign ? ` · Funkrufname ${v.radioCallSign}` : ""} · Nr. {v.internalNumber}
      </p>
      <VehicleTabs id={id} tabs={tabs} />
      {children}
    </>
  );
}
