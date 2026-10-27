import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { summarizeVehicles, assignableUsers } from "@/server/services/vehicles";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { DefectForm } from "@/components/defect-form";

export const metadata = { title: "Mangel melden" };

export default async function NewDefectPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("defects.report");
  const sp = await searchParams;
  const vehicles = (await summarizeVehicles(actor)).map((v) => ({ id: v.id, name: v.name, licensePlate: v.licensePlate, mileage: v.mileage }));
  const canAssign = can(actor, "defects.manage");
  const users = canAssign ? await assignableUsers() : [];
  return (
    <>
      <PageHeader title="Mangel melden" back={sp.vehicleId ? { href: `/fahrzeuge/${sp.vehicleId}`, label: "Zum Fahrzeug" } : { href: "/maengel", label: "Mängel" }} />
      {vehicles.length === 0 ? (
        <EmptyState title="Kein Fahrzeug verfügbar">Ihnen ist kein Fahrzeug zugewiesen.</EmptyState>
      ) : (
        <Card>
          <DefectForm userId={actor.id} vehicles={vehicles} defaultVehicleId={sp.vehicleId} draftId={sp.entwurf} canAssign={canAssign} users={users} />
        </Card>
      )}
    </>
  );
}
