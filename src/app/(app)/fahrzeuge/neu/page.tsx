import { requireActiveActor } from "@/server/auth/current";
import { assignableUsers, listVehicleTypes } from "@/server/services/vehicles";
import { Card, PageHeader } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { createVehicleAction } from "@/app/actions/vehicles";

export const metadata = { title: "Fahrzeug anlegen" };

export default async function NewVehiclePage() {
  await requireActiveActor("vehicles.manage");
  const [types, users] = await Promise.all([listVehicleTypes(), assignableUsers()]);
  return (
    <>
      <PageHeader title="Fahrzeug anlegen" back={{ href: "/fahrzeuge", label: "Fahrzeuge" }} />
      <Card>
        <VehicleForm action={createVehicleAction} types={types} users={users} submitLabel="Fahrzeug anlegen" />
      </Card>
    </>
  );
}
