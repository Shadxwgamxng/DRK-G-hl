import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutGrid, List, Package } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { listCategories, listMaterials, listVehicleStock } from "@/server/services/materials";
import { copySourceOptions, getCompartmentForView, listCompartments, CONTAINER_KINDS } from "@/server/services/compartments";
import { locationOptions } from "@/server/services/warehouse";
import { notFoundOnError } from "@/server/page-helpers";
import { Card, EmptyState } from "@/components/ui";
import { ActionForm, InlineAction, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/forms";
import { SearchSelect } from "@/components/search-select";
import { Breadcrumb, KindIcon, LocationCard, StatsBadges, StockTable, statsOf } from "@/components/loadout";
import { createStockAction, markCheckedAction } from "@/app/actions/materials";
import { copyLoadoutAction, createCompartmentAction, deleteCompartmentAction, updateCompartmentAction } from "@/app/actions/compartments";
import { COMPARTMENT_KIND } from "@/lib/labels";

export default async function VehicleMaterialPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("materials.view");
  const { id } = await params;
  const sp = await searchParams;
  const listView = sp.ansicht === "liste";
  const [stocks, tree, categories] = await Promise.all([
    notFoundOnError(() => listVehicleStock(actor, id, listView ? { categoryId: sp.categoryId, q: sp.q, state: sp.state } : {})),
    listCompartments(actor, id),
    listCategories(),
  ]);
  const manage = can(actor, "materials.manage");
  const [materials, locations, copySources] = manage ? await Promise.all([listMaterials(actor), locationOptions(), copySourceOptions(actor, id)]) : [[], [], []];
  const base = `/fahrzeuge/${id}/material`;
  const allLocations = tree.flatMap((c) => [{ value: c.id, label: c.name }, ...c.children.map((f) => ({ value: f.id, label: `${c.name} › ${f.name}` }))]);

  const viewToggle = (
    <div className="flex gap-2">
      <Link href={base} className={`inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 text-sm font-semibold ${!listView ? "border-drkblue-900 bg-drkblue-900 text-white" : "border-gray-300 bg-white"}`}>
        <LayoutGrid className="h-4 w-4" /> Schränke & Fächer
      </Link>
      <Link href={`${base}?ansicht=liste`} className={`inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 text-sm font-semibold ${listView ? "border-drkblue-900 bg-drkblue-900 text-white" : "border-gray-300 bg-white"}`}>
        <List className="h-4 w-4" /> Liste & Filter
      </Link>
    </div>
  );

  const addStockForm = (fixedCompartmentId?: string) =>
    manage && (
      <Card title="Material hinzufügen">
        {materials.length === 0 ? (
          <p className="text-sm text-gray-600">Der Materialkatalog ist leer. <Link className="font-semibold underline" href="/material">Material im Katalog anlegen</Link>.</p>
        ) : (
          <ActionForm action={createStockAction.bind(null, id)}>
            <div className="grid gap-4 md:grid-cols-3">
              <SearchSelect
                label="Material"
                name="materialId"
                required
                className="md:col-span-2"
                placeholder="Material suchen, z. B. „dreiweg“ oder „vvk 18“"
                hint={`${materials.length} Materialien im Katalog – Name, Kategorie oder Abkürzung eintippen`}
                options={materials.map((m) => ({
                  value: m.id,
                  label: m.name,
                  detail: [m.category.name, m.batchTracked && "mit Verfallsdatum", m.isEquipment && "Gerät", m.isNarcotic && "BtM", m.articleNumber && `Art.-Nr. ${m.articleNumber}`].filter(Boolean).join(" · "),
                }))}
              />
              {fixedCompartmentId ? (
                <input type="hidden" name="compartmentId" value={fixedCompartmentId} />
              ) : (
                <SelectInput label="Lagerort" name="compartmentId" placeholder="– ohne Lagerort –" options={allLocations} />
              )}
              <TextInput label="Sollbestand" name="targetQuantity" type="number" inputMode="numeric" min={0} required />
              <TextInput label="Mindestbestand" name="minQuantity" type="number" inputMode="numeric" min={0} required defaultValue={0} />
              <SelectInput label="Nachfülllager" name="refillLocationId" placeholder="– kein –" options={locations.map((l) => ({ value: l.id, label: `${l.warehouse.name} – ${l.name}` }))} />
              <TextInput label="Anfangsbestand" name="initialQuantity" type="number" inputMode="numeric" min={0} defaultValue={0} hint="Optional – sonst beim ersten Check erfassen" />
              <TextInput label="Verfallsdatum" name="initialBatchExpiry" type="date" hint="Bei Material mit Verfallsdatum und Anfangsbestand" />
              <TextInput label="Chargennummer (optional, bei BtM Pflicht)" name="initialBatchNumber" />
            </div>
            <TextArea label="Bemerkungen" name="remarks" rows={2} />
            <SubmitButton>Material hinzufügen</SubmitButton>
          </ActionForm>
        )}
      </Card>
    );

  // ───────── Listenansicht (alle Positionen, filterbar) ─────────
  if (listView) {
    return (
      <div className="space-y-5">
        {viewToggle}
        <form className="card grid gap-3 p-3 sm:grid-cols-4" role="search">
          <input type="hidden" name="ansicht" value="liste" />
          <input name="q" defaultValue={sp.q} placeholder="Material suchen" className="input" aria-label="Material suchen" />
          <select name="categoryId" defaultValue={sp.categoryId ?? ""} className="input" aria-label="Kategorie">
            <option value="">Alle Kategorien</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="state" defaultValue={sp.state ?? ""} className="input" aria-label="Zustand">
            <option value="">Alle Positionen</option>
            <option value="missing">Fehlend / unter Soll</option>
            <option value="expired">Abgelaufen</option>
            <option value="expiring">Abgelaufen oder bald ablaufend</option>
          </select>
          <button className="min-h-12 rounded-sm bg-drkblue-900 px-4 text-sm font-semibold text-white hover:bg-drkblue-600">Filtern</button>
        </form>
        {stocks.length === 0 ? (
          <EmptyState icon={<Package className="h-12 w-12" />} title="Keine Materialpositionen">{sp.q || sp.state || sp.categoryId ? "Keine Treffer für die Filter." : "Für dieses Fahrzeug ist noch kein Material hinterlegt."}</EmptyState>
        ) : (
          <Card title={`${stocks.length} Positionen`} padded={false}>
            <StockTable rows={stocks} vehicleId={id} showLocation />
          </Card>
        )}
        {addStockForm()}
      </div>
    );
  }

  // ───────── Ohne Lagerort ─────────
  if (sp.ort === "ohne") {
    const rows = stocks.filter((s) => !s.compartmentId);
    return (
      <div className="space-y-5">
        <Breadcrumb items={[{ label: "Beladung", href: base }, { label: "Ohne Lagerort" }]} />
        <Card title="Ohne Lagerort" padded={rows.length === 0}>
          {rows.length === 0 ? <p className="text-sm text-gray-600">Alle Positionen sind einem Lagerort zugeordnet.</p> : <StockTable rows={rows} vehicleId={id} />}
        </Card>
        <p className="text-sm text-gray-600">Tipp: Position öffnen und unter „Position bearbeiten“ einen Schrank oder ein Fach wählen.</p>
      </div>
    );
  }

  // ───────── Schrank/Behälter oder Fach ─────────
  if (sp.ort) {
    const loc = await getCompartmentForView(actor, id, sp.ort).catch(() => null);
    if (!loc) notFound();
    const isFach = Boolean(loc.parentId);
    const here = stocks.filter((s) => s.compartmentId === loc.id);
    const containers = tree.map((c) => ({ value: c.id, label: c.name }));
    return (
      // key: Formulare beim Wechsel zu einem anderen Schrank/Fach neu aufbauen (sonst bleiben alte Eingabewerte stehen)
      <div key={loc.id} className="space-y-5">
        <Breadcrumb items={[{ label: "Beladung", href: base }, ...(loc.parent ? [{ label: loc.parent.name, href: `${base}?ort=${loc.parent.id}` }] : []), { label: loc.name }]} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-drkblue-900"><KindIcon kind={loc.kind} className="h-8 w-8" /></span>
          <div>
            <h2 className="text-xl font-bold">{loc.name}</h2>
            <p className="text-sm text-gray-600">{COMPARTMENT_KIND[loc.kind]}{loc.parent ? ` in ${loc.parent.name}` : ""}</p>
          </div>
        </div>

        {!isFach && (
          <section className="space-y-3">
            <h3 className="font-bold">Fächer</h3>
            {loc.children.length === 0 ? (
              <p className="text-sm text-gray-600">{manage ? "Noch keine Fächer – unten anlegen, oder Material direkt hier ablegen." : "Keine Fächer."}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {loc.children.map((f) => {
                  const st = statsOf(stocks.filter((s) => s.compartmentId === f.id));
                  return <LocationCard key={f.id} href={`${base}?ort=${f.id}`} name={f.name} kind={f.kind} detail={`${st.positions} Position(en)`} stats={st} />;
                })}
              </div>
            )}
          </section>
        )}

        <Card title={isFach ? "Material in diesem Fach" : "Material direkt in diesem Schrank/Behälter"} padded={here.length === 0}>
          {here.length === 0 ? <p className="text-sm text-gray-600">Hier liegt noch kein Material.</p> : <StockTable rows={here} vehicleId={id} />}
        </Card>

        {addStockForm(loc.id)}

        {manage && (
          <div className="grid gap-5 lg:grid-cols-2">
            {!isFach && (
              <Card title="Fach anlegen">
                <ActionForm action={createCompartmentAction.bind(null, id, loc.id)} resetOnSuccess>
                  <TextInput label="Name des Fachs" name="name" required placeholder="z. B. Fach 1, Fach Zugang, Seitentasche" />
                  <SubmitButton>Fach anlegen</SubmitButton>
                </ActionForm>
              </Card>
            )}
            <Card title={isFach ? "Fach bearbeiten" : "Schrank/Behälter bearbeiten"}>
              <ActionForm action={updateCompartmentAction.bind(null, loc.id, id)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput label="Name" name="name" required defaultValue={loc.name} />
                  {isFach ? (
                    <SelectInput label="Liegt in" name="parentId" required defaultValue={loc.parentId ?? ""} options={containers} />
                  ) : (
                    <SelectInput label="Art" name="kind" required defaultValue={loc.kind} options={CONTAINER_KINDS.map((k) => ({ value: k, label: COMPARTMENT_KIND[k] }))} />
                  )}
                  <TextInput label="Reihenfolge" name="sortOrder" type="number" inputMode="numeric" min={0} defaultValue={loc.sortOrder} hint="Kleinere Zahl = weiter vorne (auch beim Check)" />
                </div>
                <SubmitButton variant="secondary">Speichern</SubmitButton>
              </ActionForm>
              <div className="mt-4 border-t border-gray-200 pt-4">
                <InlineAction action={deleteCompartmentAction.bind(null, loc.id, id)} variant="danger" confirm={`„${loc.name}“ wirklich löschen? Nur möglich, wenn leer.`}>
                  {isFach ? "Fach löschen" : "Schrank/Behälter löschen"}
                </InlineAction>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // ───────── Übersicht: alle Schränke/Behälter ─────────
  const unassigned = stocks.filter((s) => !s.compartmentId);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb items={[{ label: "Beladung" }]} />
        {viewToggle}
      </div>

      {tree.length === 0 && unassigned.length === 0 ? (
        <EmptyState icon={<Package className="h-12 w-12" />} title="Noch keine Beladung hinterlegt">
          {manage ? "Legen Sie unten den ersten Schrank, Rucksack oder Behälter an – oder übernehmen Sie die Beladung eines anderen Fahrzeugs." : "Für dieses Fahrzeug ist noch kein Material hinterlegt."}
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tree.map((c) => {
            const ids = new Set([c.id, ...c.children.map((f) => f.id)]);
            const st = statsOf(stocks.filter((s) => s.compartmentId && ids.has(s.compartmentId)));
            return <LocationCard key={c.id} href={`${base}?ort=${c.id}`} name={c.name} kind={c.kind} detail={`${c.children.length} Fächer · ${st.positions} Position(en)`} stats={st} />;
          })}
          {unassigned.length > 0 && (
            <Link href={`${base}?ort=ohne`} className="card flex min-h-24 flex-col justify-center gap-2 border-dashed p-4 hover:bg-gray-50">
              <span className="font-bold">Ohne Lagerort</span>
              <span className="text-xs text-gray-500">{unassigned.length} Position(en) noch keinem Schrank/Fach zugeordnet</span>
              <StatsBadges s={statsOf(unassigned)} />
            </Link>
          )}
        </div>
      )}

      {stocks.length > 0 && can(actor, "materials.report") && (
        <div className="flex justify-end">
          <InlineAction action={markCheckedAction.bind(null, id, undefined)} confirm="Alle Materialpositionen dieses Fahrzeugs als heute geprüft markieren? (Nur, wenn Bestand und Verfallsdaten tatsächlich geprüft wurden.)">
            Bestand vollständig geprüft
          </InlineAction>
        </div>
      )}

      {manage && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Schrank / Rucksack / Behälter anlegen">
            <ActionForm action={createCompartmentAction.bind(null, id, null)} resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput label="Name" name="name" required placeholder="z. B. Ausziehschrank links, Notfallrucksack" />
                <SelectInput label="Art" name="kind" required defaultValue="CABINET" options={CONTAINER_KINDS.map((k) => ({ value: k, label: COMPARTMENT_KIND[k] }))} />
              </div>
              <SubmitButton>Anlegen</SubmitButton>
            </ActionForm>
          </Card>
          {copySources.length > 0 && (
            <Card title="Beladung von anderem Fahrzeug übernehmen">
              <ActionForm action={copyLoadoutAction.bind(null, id)}>
                <SelectInput label="Vorlage-Fahrzeug" name="fromVehicleId" required placeholder="Bitte wählen" options={copySources.map((v) => ({ value: v.id, label: `${v.name} (${v.internalNumber})` }))} />
                <p className="text-sm text-gray-600">Übernimmt Schränke, Fächer und Soll-Mengen. Bestände werden nicht kopiert – die tatsächlichen Mengen beim ersten Check erfassen. Vorhandenes bleibt unverändert.</p>
                <SubmitButton variant="secondary">Beladung übernehmen</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      )}
      {manage && unassigned.length === 0 && tree.length > 0 && <p className="text-sm text-gray-600">Material legen Sie im jeweiligen Schrank bzw. Fach an.</p>}
    </div>
  );
}
