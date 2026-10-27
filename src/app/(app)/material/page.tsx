import { Package } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { listCategories, listMaterials } from "@/server/services/materials";
import { getSettings } from "@/server/settings";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, Checkbox, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/forms";
import { Uploader } from "@/components/Uploader";
import { upsertMaterialAction } from "@/app/actions/materials";

export const metadata = { title: "Materialkatalog" };

type Cat = { id: string; name: string };
type M = { id: string; name: string; articleNumber: string | null; categoryId: string; description: string | null; unit: string; manufacturer: string | null; batchTracked: boolean; remarks: string | null; archived: boolean };

function MaterialFields({ categories, m }: { categories: Cat[]; m?: M }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <TextInput label="Materialname" name="name" required defaultValue={m?.name} className="md:col-span-2" />
        <TextInput label="Artikelnummer" name="articleNumber" defaultValue={m?.articleNumber ?? ""} />
        <SelectInput label="Kategorie" name="categoryId" required defaultValue={m?.categoryId} placeholder="Bitte wählen" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        <TextInput label="Mengeneinheit" name="unit" required defaultValue={m?.unit ?? "Stück"} hint="Stück, Packung, Flasche, Set …" />
        <TextInput label="Hersteller" name="manufacturer" defaultValue={m?.manufacturer ?? ""} />
      </div>
      <TextArea label="Beschreibung" name="description" defaultValue={m?.description ?? ""} rows={2} />
      <TextArea label="Bemerkungen" name="remarks" defaultValue={m?.remarks ?? ""} rows={2} />
      <Checkbox name="batchTracked" label="Chargenführung mit Verfallsdatum" hint="Bestand wird je Charge geführt; beim Austragen muss die Charge gewählt werden." defaultChecked={m?.batchTracked} />
      <Uploader name="imageId" label="Produktbild (optional)" allowPdf={false} single />
    </>
  );
}

export default async function MaterialCatalogPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("materials.catalog");
  const sp = await searchParams;
  const [materials, categories, settings] = await Promise.all([listMaterials(actor, { q: sp.q, categoryId: sp.categoryId, includeArchived: sp.archiv === "1" }), listCategories(), getSettings()]);
  return (
    <>
      <PageHeader title="Materialkatalog" subtitle="Zentrale Artikelliste für Fahrzeuge und Lager" />
      {!settings.medicationsEnabled && <Alert tone="info" className="mb-4" title="Die Medikamentenverwaltung ist nicht freigeschaltet (Einstellungen)." />}
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-4">
        <input name="q" defaultValue={sp.q} placeholder="Name oder Artikelnummer" className="input sm:col-span-2" aria-label="Suche" />
        <select name="categoryId" defaultValue={sp.categoryId ?? ""} className="input" aria-label="Kategorie">
          <option value="">Alle Kategorien</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="min-h-12 rounded-lg bg-anthracite-800 px-4 text-sm font-semibold text-white">Filtern</button>
      </form>
      <Card title="Neues Material" className="mb-5">
        <ActionForm action={upsertMaterialAction.bind(null, null)} resetOnSuccess>
          <MaterialFields categories={categories} />
          <SubmitButton>Material anlegen</SubmitButton>
        </ActionForm>
      </Card>
      {materials.length === 0 ? (
        <EmptyState icon={<Package className="h-12 w-12" />} title="Keine Materialien im Katalog" />
      ) : (
        <Card padded={false} title={`${materials.length} Materialien`}>
          <ul className="divide-y divide-gray-100">
            {materials.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    {m.imageId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/files/${m.imageId}`} alt="" className="h-10 w-10 rounded object-cover" />
                    )}
                    <span className="font-semibold">{m.name}</span>
                    {m.articleNumber && <span className="text-xs text-gray-500">Art.-Nr. {m.articleNumber}</span>}
                    <Badge>{m.category.name}</Badge>
                    {m.batchTracked && <Badge tone="blue">Charge</Badge>}
                    {m.archived && <Badge tone="dark">archiviert</Badge>}
                    <span className="text-xs text-gray-500">in {m._count.vehicleStocks} Fahrzeug(en), {m._count.warehouseStocks} Lagerplatz/-plätzen</span>
                  </summary>
                  <div className="mt-3">
                    <ActionForm action={upsertMaterialAction.bind(null, m.id)}>
                      <MaterialFields categories={categories} m={m} />
                      <Checkbox name="archived" label="Archiviert (nicht mehr neu verwendbar)" defaultChecked={m.archived} />
                      <SubmitButton variant="secondary">Speichern</SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
