import { requireActiveActor } from "@/server/auth/current";
import { assertVehicleAccess } from "@/server/access";
import { assignableUsers, listVehicleTypes } from "@/server/services/vehicles";
import { Card, PageHeader } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { updateVehicleAction } from "@/app/actions/vehicles";
import { notFoundOnError } from "@/server/page-helpers";

export const metadata = { title: "Fahrzeug bearbeiten" };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActiveActor("vehicles.manage");
  const { id } = await params;
  const v = await notFoundOnError(() => assertVehicleAccess(actor, id));
  const [types, users] = await Promise.all([listVehicleTypes(), assignableUsers()]);
  return (
    <>
      <PageHeader title={`${v.name} bearbeiten`} back={{ href: `/fahrzeuge/${id}`, label: v.name }} />
      <Card>
        <VehicleForm action={updateVehicleAction.bind(null, id)} vehicle={v} types={types} users={users} submitLabel="Änderungen speichern" />
      </Card>
    </>
  );
}
