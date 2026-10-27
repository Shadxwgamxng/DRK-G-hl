import { requireActiveActor } from "@/server/auth/current";
import { checklistForVehicle } from "@/server/services/checks";
import { notFoundOnError } from "@/server/page-helpers";
import { Alert, EmptyState, LinkButton } from "@/components/ui";
import { CheckForm } from "@/components/check-form";

export const metadata = { title: "Fahrzeugkontrolle" };

export default async function CheckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("checks.perform");
  const { id } = await params;
  const sp = await searchParams;
  const { vehicle, checklist } = await notFoundOnError(() => checklistForVehicle(actor, id));
  if (vehicle.archivedAt) return <Alert tone="warning" title="Archivierte Fahrzeuge können nicht kontrolliert werden." />;
  if (!checklist || checklist.items.length === 0)
    return (
      <EmptyState title="Keine Checkliste konfiguriert" action={<LinkButton href="/admin/checklisten">Checklisten verwalten</LinkButton>}>
        Für diesen Fahrzeugtyp ist keine aktive Checkliste hinterlegt.
      </EmptyState>
    );
  return (
    <>
      <h2 className="mb-1 text-xl font-bold">Fahrzeugkontrolle</h2>
      <p className="mb-4 text-sm text-gray-600">Checkliste: {checklist.name}</p>
      <CheckForm
        userId={actor.id}
        draftId={sp.entwurf}
        vehicle={{ id: vehicle.id, name: vehicle.name, mileage: vehicle.mileage }}
        checklist={{ id: checklist.id, name: checklist.name, description: checklist.description, items: checklist.items.map((i) => ({ id: i.id, label: i.label, description: i.description })) }}
      />
    </>
  );
}
