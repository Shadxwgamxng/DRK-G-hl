import { requireActiveActor } from "@/server/auth/current";
import { listWarehouses } from "@/server/services/warehouse";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, Checkbox, SelectInput, SubmitButton, TextInput } from "@/components/forms";
import { upsertLocationAction, upsertWarehouseAction } from "@/app/actions/warehouse";

export const metadata = { title: "Lagerorte" };

export default async function LocationsPage() {
  const actor = await requireActiveActor("warehouse.manage");
  const warehouses = await listWarehouses(actor);
  return (
    <>
      <PageHeader title="Lager & Lagerorte" back={{ href: "/lager", label: "Zentrallager" }} />
      <div className="space-y-5">
        {warehouses.map((w) => (
          <Card key={w.id} title={w.name}>
            {w.description && <p className="mb-3 text-sm text-gray-600">{w.description}</p>}
            <ul className="divide-y divide-gray-100">
              {w.locations.map((l) => (
                <li key={l.id} className="py-2">
                  <details>
                    <summary className="cursor-pointer text-sm"><b>{l.name}</b>{l.code ? ` (${l.code})` : ""} · {l._count.stocks} Bestandsposition(en)</summary>
                    <ActionForm action={upsertLocationAction} className="mt-2">
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="warehouseId" value={w.id} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <TextInput label="Bezeichnung" name="name" defaultValue={l.name} required />
                        <TextInput label="Kürzel" name="code" defaultValue={l.code ?? ""} />
                        <TextInput label="Beschreibung" name="description" defaultValue={l.description ?? ""} />
                      </div>
                      <Checkbox name="archived" label="Lagerort archivieren (nur ohne Bestand)" />
                      <SubmitButton size="sm" variant="secondary">Speichern</SubmitButton>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Neuer Lagerort">
            <ActionForm action={upsertLocationAction} resetOnSuccess>
              <SelectInput label="Lager" name="warehouseId" required options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
              <TextInput label="Bezeichnung (Regal, Fach …)" name="name" required placeholder="z. B. Regal 3, Fach B" />
              <TextInput label="Kürzel" name="code" />
              <TextInput label="Beschreibung" name="description" />
              <SubmitButton>Lagerort anlegen</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Neues Lager">
            <ActionForm action={upsertWarehouseAction} resetOnSuccess>
              <TextInput label="Name" name="name" required />
              <TextInput label="Beschreibung" name="description" />
              <SubmitButton variant="secondary">Lager anlegen</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
