import Link from "next/link";
import { Boxes } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { listWarehouseStock, locationOptions } from "@/server/services/warehouse";
import { listCategories, listMaterials } from "@/server/services/materials";
import { Badge, Card, EmptyState, LinkButton, PageHeader, TableWrap } from "@/components/ui";
import { ExpiryBadge } from "@/components/status";
import { ActionForm, SelectInput, SubmitButton, TextInput } from "@/components/forms";
import { receiveStockAction, setWarehouseMinAction, warehouseMovementAction } from "@/app/actions/warehouse";
import { fmtDate } from "@/lib/format";
import { MOVEMENT_REASON } from "@/lib/labels";

export const metadata = { title: "Zentrallager" };

export default async function WarehousePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("warehouse.view");
  const sp = await searchParams;
  const [stocks, locations, categories] = await Promise.all([listWarehouseStock(actor, { q: sp.q, locationId: sp.locationId, categoryId: sp.categoryId, state: sp.state }), locationOptions(), listCategories()]);
  const manage = can(actor, "warehouse.manage");
  const materials = manage ? await listMaterials(actor) : [];

  return (
    <>
      <PageHeader
        title="Zentrales Materiallager"
        actions={
          <>
            <LinkButton variant="secondary" href="/lager/bewegungen">Lagerbewegungen</LinkButton>
            {manage && <LinkButton variant="secondary" href="/lager/orte">Lagerorte</LinkButton>}
          </>
        }
      />
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-5">
        <input name="q" defaultValue={sp.q} placeholder="Material suchen" className="input" aria-label="Suche" />
        <select name="locationId" defaultValue={sp.locationId ?? ""} className="input" aria-label="Lagerort">
          <option value="">Alle Lagerorte</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.warehouse.name} – {l.name}</option>)}
        </select>
        <select name="categoryId" defaultValue={sp.categoryId ?? ""} className="input" aria-label="Kategorie">
          <option value="">Alle Kategorien</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="state" defaultValue={sp.state ?? ""} className="input" aria-label="Zustand">
          <option value="">Alle</option>
          <option value="low">Unter Mindestbestand</option>
          <option value="expiring">Abgelaufen / bald ablaufend</option>
        </select>
        <button className="min-h-12 rounded-lg bg-anthracite-800 px-4 text-sm font-semibold text-white">Filtern</button>
      </form>

      <Card padded={stocks.length === 0} className="mb-5">
        {stocks.length === 0 ? (
          <EmptyState icon={<Boxes className="h-12 w-12" />} title="Keine Lagerbestände">Buchen Sie unten einen Wareneingang, um Material im Lager zu führen.</EmptyState>
        ) : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Material</th><th>Lagerort</th><th className="text-right">Bestand</th><th>Mindest</th><th>Chargen / Verfall</th></tr></thead>
              <tbody>
                {stocks.map((s) => (
                  <tr key={s.id} className={s.belowMin ? "bg-amber-50" : undefined}>
                    <td className="font-semibold">{s.material.name}<div className="text-xs font-normal text-gray-500">{s.material.category.name}</div></td>
                    <td>{s.location.warehouse.name} – {s.location.name}</td>
                    <td className="text-right font-semibold tabular-nums">{s.quantity} {s.material.unit}{s.belowMin && <div><Badge tone="yellow">unter Minimum</Badge></div>}</td>
                    <td>
                      {manage ? (
                        <ActionForm action={setWarehouseMinAction.bind(null, s.id)} className="flex items-end gap-1 space-y-0" successMessage={false}>
                          <input name="minQuantity" type="number" min={0} defaultValue={s.minQuantity} className="input w-20 min-h-10" aria-label="Mindestbestand" />
                          <SubmitButton size="sm" variant="secondary">OK</SubmitButton>
                        </ActionForm>
                      ) : s.minQuantity}
                    </td>
                    <td>
                      {s.batches.length === 0 ? "–" : (
                        <ul className="space-y-1">
                          {s.batches.map((b) => <li key={b.id} className="flex flex-wrap items-center gap-1 text-xs">{b.batchNumber ?? "o. Nr."}: {b.quantity} <ExpiryBadge date={b.expiryDate} /></li>)}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {manage && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Wareneingang (Zugang)">
            {materials.length === 0 || locations.length === 0 ? (
              <p className="text-sm text-gray-600">Zuerst <Link className="underline" href="/material">Material</Link> und <Link className="underline" href="/lager/orte">Lagerorte</Link> anlegen.</p>
            ) : (
              <ActionForm action={receiveStockAction} resetOnSuccess>
                <SelectInput label="Material" name="materialId" required placeholder="Bitte wählen" options={materials.map((m) => ({ value: m.id, label: `${m.name}${m.batchTracked ? " (Charge)" : ""}` }))} />
                <SelectInput label="Lagerort" name="locationId" required placeholder="Bitte wählen" options={locations.map((l) => ({ value: l.id, label: `${l.warehouse.name} – ${l.name}` }))} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput label="Menge" name="quantity" type="number" min={1} required inputMode="numeric" />
                  <TextInput label="Mindestbestand (optional)" name="minQuantity" type="number" min={0} inputMode="numeric" />
                  <TextInput label="Chargennummer" name="batchNumber" />
                  <TextInput label="Verfallsdatum" name="expiryDate" type="date" hint="Pflicht bei chargengeführtem Material" />
                </div>
                <TextInput label="Bemerkung (z. B. Lieferschein)" name="note" />
                <SubmitButton>Zugang buchen</SubmitButton>
              </ActionForm>
            )}
          </Card>
          <Card title="Entnahme / Austragung / Inventur">
            {stocks.length === 0 ? <p className="text-sm text-gray-600">Kein Lagerbestand vorhanden.</p> : (
              <ActionForm action={warehouseMovementAction} resetOnSuccess>
                <SelectInput
                  label="Lagerbestand"
                  name="warehouseStockId"
                  required
                  placeholder="Bitte wählen"
                  options={stocks.map((s) => ({ value: s.id, label: `${s.material.name} · ${s.location.name} (${s.quantity})` }))}
                />
                <SelectInput label="Charge (bei chargengeführtem Material)" name="batchId" placeholder="–" options={stocks.flatMap((s) => s.batches.map((b) => ({ value: b.id, label: `${s.material.name} · ${s.location.name} · ${b.batchNumber ?? "o. Nr."} · ${fmtDate(b.expiryDate)} (${b.quantity})` })))} />
                <SelectInput label="Vorgang" name="mode" required options={[{ value: "ISSUE", label: "Entnahme" }, { value: "WRITE_OFF", label: "Austragen (abgelaufen, beschädigt …)" }, { value: "CORRECTION", label: "Inventurkorrektur" }]} />
                <SelectInput label="Grund" name="reason" placeholder="–" options={Object.entries(MOVEMENT_REASON).map(([value, label]) => ({ value, label }))} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput label="Menge" name="quantity" type="number" min={1} defaultValue={1} inputMode="numeric" />
                  <TextInput label="Gezählte Menge (Inventur)" name="countedQuantity" type="number" min={0} inputMode="numeric" />
                </div>
                <TextInput label="Bemerkung" name="note" />
                <SubmitButton variant="secondary">Buchen</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
