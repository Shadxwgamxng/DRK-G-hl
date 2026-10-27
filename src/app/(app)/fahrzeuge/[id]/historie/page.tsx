import { requireActiveActor } from "@/server/auth/current";
import { vehicleHistory } from "@/server/services/vehicles";
import { AuditTable } from "@/components/audit-table";
import { Card, LinkButton } from "@/components/ui";

export default async function VehicleHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActiveActor();
  const { id } = await params;
  const logs = await vehicleHistory(actor, id, 300);
  return (
    <Card
      title="Fahrzeughistorie (Änderungsprotokoll)"
      padded={false}
      actions={
        <>
          <LinkButton size="sm" variant="secondary" href={`/api/export/fahrzeughistorie?vehicleId=${id}&format=pdf`} prefetch={false}>PDF</LinkButton>
          <LinkButton size="sm" variant="secondary" href={`/api/export/fahrzeughistorie?vehicleId=${id}&format=csv`} prefetch={false}>CSV</LinkButton>
        </>
      }
    >
      <AuditTable logs={logs} />
    </Card>
  );
}
