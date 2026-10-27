import { requireActiveActor } from "@/server/auth/current";
import { listChecklists } from "@/server/services/checks";
import { listVehicleTypes } from "@/server/services/vehicles";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { ChecklistEditor } from "@/components/checklist-editor";

export const metadata = { title: "Checklisten" };

export default async function ChecklistsPage() {
  const actor = await requireActiveActor("checklists.manage");
  const [lists, types] = await Promise.all([listChecklists(actor), listVehicleTypes()]);
  return (
    <>
      <PageHeader title="Checklisten für Fahrzeugkontrollen" />
      <Alert tone="warning" className="mb-4" title="Wichtig">
        Die mitgelieferten Prüfpunkte sind Beispiele und keine verbindliche Einsatzcheckliste. Bitte je Fahrzeugtyp durch die KFZ-Warte prüfen und anpassen.
      </Alert>
      <div className="space-y-5">
        {lists.map((l) => (
          <Card key={l.id} title={<>{l.name} {l.active ? <Badge tone="green" className="ml-2">aktiv</Badge> : <Badge className="ml-2">inaktiv</Badge>} <Badge className="ml-1">{l.vehicleType?.name ?? "Standard"}</Badge></>}>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">{l.items.filter((i) => i.active).length} aktive Prüfpunkte – bearbeiten</summary>
              <div className="mt-4">
                <ChecklistEditor types={types} usedCount={l._count.checks} value={{ id: l.id, name: l.name, description: l.description, vehicleTypeId: l.vehicleTypeId, active: l.active, items: l.items.map((i) => ({ id: i.id, label: i.label, description: i.description, active: i.active })) }} />
              </div>
            </details>
          </Card>
        ))}
        <Card title="Neue Checkliste">
          <ChecklistEditor types={types} value={{ name: "", active: true, items: [{ label: "", active: true }] }} />
        </Card>
      </div>
    </>
  );
}
