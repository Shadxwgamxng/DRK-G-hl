import { requireActiveActor } from "@/server/auth/current";
import { listDefects } from "@/server/services/defects";
import { DefectTable } from "@/components/defect-table";
import { Card, LinkButton } from "@/components/ui";
import { can } from "@/server/actor";

export default async function VehicleDefects({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const { id } = await params;
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const defects = await listDefects(actor, { vehicleId: id, status });
  return (
    <Card
      title="Mängel dieses Fahrzeugs"
      padded={false}
      actions={
        <>
          <LinkButton size="sm" variant={status === "open" ? "primary" : "secondary"} href="?status=open">Offen</LinkButton>
          <LinkButton size="sm" variant={status === "all" ? "primary" : "secondary"} href="?status=all">Alle</LinkButton>
          {can(actor, "defects.report") && <LinkButton size="sm" href={`/maengel/neu?vehicleId=${id}`}>Mangel melden</LinkButton>}
        </>
      }
    >
      <DefectTable defects={defects} showVehicle={false} />
    </Card>
  );
}
