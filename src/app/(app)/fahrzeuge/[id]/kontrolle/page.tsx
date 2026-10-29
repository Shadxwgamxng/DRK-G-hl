import { requireActiveActor } from "@/server/auth/current";
import { checklistForVehicle } from "@/server/services/checks";
import { materialsForCheck } from "@/server/services/check-materials";
import { toDateInput, berlinToday } from "@/lib/format";
import { notFoundOnError } from "@/server/page-helpers";
import { Alert, EmptyState, LinkButton } from "@/components/ui";
import { CheckForm } from "@/components/check-form";

export const metadata = { title: "Fahrzeugkontrolle" };

export default async function CheckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("checks.perform");
  const { id } = await params;
  const sp = await searchParams;
  const { vehicle, checklist } = await notFoundOnError(() => checklistForVehicle(actor, id));
  const mat = await materialsForCheck(actor, id);
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
        materials={{
          today: toDateInput(berlinToday()),
          warnDays: mat.expiryWarningDays,
          hiddenNarcotics: mat.hiddenNarcotics,
          loadedAt: new Date().toISOString(),
          stocks: mat.stocks.map((s) => ({
            id: s.id,
            name: s.material.name,
            unit: s.material.unit,
            compartment: s.compartment,
            locationHint: s.locationHint,
            category: s.material.category.name,
            target: s.targetQuantity,
            current: s.currentQuantity,
            isEquipment: s.material.isEquipment,
            isNarcotic: s.material.isNarcotic,
            batchTracked: s.material.batchTracked,
            batches: s.batches.map((b) => ({ id: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate?.toISOString() ?? null, quantity: b.quantity })),
          })),
        }}
      />
    </>
  );
}
