import Link from "next/link";
import { Package } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { listCategories, listMaterials, listVehicleStock } from "@/server/services/materials";
import { locationOptions } from "@/server/services/warehouse";
import { notFoundOnError } from "@/server/page-helpers";
import { Badge, Card, EmptyState, TableWrap } from "@/components/ui";
import { RefillStatusBadge } from "@/components/status";
import { ActionForm, InlineAction, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/forms";
import { createStockAction, markCheckedAction } from "@/app/actions/materials";
import { fmtDate } from "@/lib/format";

export default async function VehicleMaterialPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("materials.view");
  const { id } = await params;
  const sp = await searchParams;
  const [stocks, categories] = await Promise.all([notFoundOnError(() => listVehicleStock(actor, id, { categoryId: sp.categoryId, q: sp.q, state: sp.state })), listCategories()]);
  const manage = can(actor, "materials.manage");
  const [materials, locations] = manage ? await Promise.all([listMaterials(actor), locationOptions()]) : [[], []];
  const used = new Set(stocks.map((s) => s.materialId));
  const groups = new Map<string, typeof stocks>();
  for (const s of stocks) groups.set(s.material.category.name, [...(groups.get(s.material.category.name) ?? []), s]);

  return (
    <div className="space-y-5">
      <form className="card grid gap-3 p-3 sm:grid-cols-4" role="search">
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
        <button className="min-h-12 rounded-lg bg-drkblue-900 px-4 text-sm font-semibold text-white hover:bg-drkblue-600">Filtern</button>
      </form>

      {stocks.length === 0 ? (
        <EmptyState icon={<Package className="h-12 w-12" />} title="Keine Materialpositionen">
          {sp.q || sp.state || sp.categoryId ? "Keine Treffer für die Filter." : manage ? "Legen Sie unten die erste Materialposition für dieses Fahrzeug an." : "Für dieses Fahrzeug ist noch kein Material hinterlegt."}
        </EmptyState>
      ) : (
        [...groups.entries()].map(([cat, list]) => (
          <Card key={cat} title={cat} padded={false}>
            <TableWrap>
              <table className="table-base">
                <thead>
                  <tr><th>Material</th><th>Lagerort im Fahrzeug</th><th className="text-right">Ist / Soll</th><th>Zustand</th><th>Nächster Verfall</th><th>Nachfüllung</th></tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/fahrzeuge/${id}/material/${s.id}`} className="font-semibold hover:text-drkblue-600">{s.material.name}</Link>
                        {s.material.articleNumber && <div className="text-xs text-gray-500">Art.-Nr. {s.material.articleNumber}</div>}
                      </td>
                      <td>{s.compartment ?? "–"}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        <span className={s.missing ? "font-bold text-drk-600" : "font-semibold"}>{s.currentQuantity}</span> / {s.targetQuantity} {s.material.unit}
                        <div className="text-xs text-gray-500">Min. {s.minQuantity}</div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {s.belowMin && <Badge tone="red">unter Mindestbestand</Badge>}
                          {s.missing > 0 && !s.belowMin && <Badge tone="orange">{s.missing} fehlen</Badge>}
                          {s.expiredQty > 0 && <Badge tone="red">{s.expiredQty} abgelaufen</Badge>}
                          {s.expiringQty > 0 && <Badge tone="yellow">{s.expiringQty} läuft bald ab</Badge>}
                          {!s.missing && !s.expiredQty && !s.expiringQty && <Badge tone="green">OK</Badge>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">{fmtDate(s.nextExpiry)}</td>
                      <td>{s.activeRefill ? <RefillStatusBadge status={s.activeRefill.status} /> : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        ))
      )}

      {stocks.length > 0 && can(actor, "materials.report") && (
        <div className="flex justify-end">
          <InlineAction action={markCheckedAction.bind(null, id, undefined)} confirm="Alle Materialpositionen dieses Fahrzeugs als heute geprüft markieren? (Nur, wenn Bestand und Verfallsdaten tatsächlich geprüft wurden.)">
            Bestand vollständig geprüft
          </InlineAction>
        </div>
      )}

      {manage && (
        <Card title="Materialposition hinzufügen">
          {materials.length === 0 ? (
            <p className="text-sm text-gray-600">Der Materialkatalog ist leer. <Link className="font-semibold underline" href="/material">Material im Katalog anlegen</Link>.</p>
          ) : (
            <ActionForm action={createStockAction.bind(null, id)}>
              <div className="grid gap-4 md:grid-cols-3">
                <SelectInput label="Material" name="materialId" required placeholder="Bitte wählen" className="md:col-span-2" options={materials.filter((m) => !used.has(m.id)).map((m) => ({ value: m.id, label: `${m.name} (${m.category.name}${m.batchTracked ? ", mit Verfallsdatum" : ""}${m.isNarcotic ? ", BtM" : ""})` }))} />
                <TextInput label="Fach / Schrank / Tasche" name="compartment" placeholder="z. B. Schrank 2, Fach B" />
                <TextInput label="Sollbestand" name="targetQuantity" type="number" inputMode="numeric" min={0} required />
                <TextInput label="Mindestbestand" name="minQuantity" type="number" inputMode="numeric" min={0} required defaultValue={0} />
                <SelectInput label="Nachfülllager" name="refillLocationId" placeholder="– kein –" options={locations.map((l) => ({ value: l.id, label: `${l.warehouse.name} – ${l.name}` }))} />
                <TextInput label="Anfangsbestand" name="initialQuantity" type="number" inputMode="numeric" min={0} defaultValue={0} hint="Wird als protokollierte Erstbuchung erfasst" />
                <TextInput label="Chargennummer (optional, bei BtM Pflicht)" name="initialBatchNumber" />
                <TextInput label="Verfallsdatum" name="initialBatchExpiry" type="date" hint="Pflicht bei Material mit Verfallsdatum und Anfangsbestand" />
              </div>
              <TextArea label="Bemerkungen" name="remarks" rows={2} />
              <SubmitButton>Position anlegen</SubmitButton>
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
