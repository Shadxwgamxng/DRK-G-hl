import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { getVehicleStock } from "@/server/services/materials";
import { locationOptions } from "@/server/services/warehouse";
import { notFoundOnError } from "@/server/page-helpers";
import { Alert, Badge, Card, DefinitionList, TableWrap } from "@/components/ui";
import { ExpiryBadge, RefillStatusBadge } from "@/components/status";
import { ActionForm, Checkbox, InlineAction, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/forms";
import { WriteOffForm } from "@/components/writeoff-form";
import { correctStockAction, deactivateStockAction, updateStockAction } from "@/app/actions/materials";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { MOVEMENT_REASON, MOVEMENT_TYPE } from "@/lib/labels";

export default async function StockDetail({ params, searchParams }: { params: Promise<{ id: string; stockId: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor("materials.view");
  const { id, stockId } = await params;
  const sp = await searchParams;
  const s = await notFoundOnError(() => getVehicleStock(actor, stockId));
  const manage = can(actor, "materials.manage");
  const locations = manage ? await locationOptions() : [];
  const path = `/fahrzeuge/${id}/material/${stockId}`;
  const batchesWithStock = s.batches.filter((b) => b.quantity > 0);
  const activeRefill = s.refillRequests.find((r) => ["OPEN", "IN_PROGRESS", "PROVIDED"].includes(r.status));

  return (
    <div className="space-y-5">
      {sp.neu && <Alert tone="success" title="Materialposition angelegt." />}
      <Card title={s.material.name} actions={<Badge>{s.material.category.name}</Badge>}>
        <DefinitionList
          items={[
            ["Aktueller Bestand / Soll", <span key="b" className="text-lg font-bold">{s.currentQuantity} / {s.targetQuantity} {s.material.unit}</span>],
            ["Mindestbestand", `${s.minQuantity} ${s.material.unit}`],
            ["Lagerort im Fahrzeug", s.compartment ?? "–"],
            ["Nachfülllager", s.refillLocation ? `${s.refillLocation.warehouse.name}, ${s.refillLocation.name}` : "–"],
            ["Artikelnummer", s.material.articleNumber ?? "–"],
            ["Hersteller", s.material.manufacturer ?? "–"],
            ["Chargenführung", s.material.batchTracked ? "Ja – Bestand je Charge mit Verfallsdatum" : "Nein"],
            ["Letzte Kontrolle", fmtDateTime(s.lastCheckedAt)],
          ]}
        />
        {s.material.description && <p className="mt-3 text-sm text-gray-700">{s.material.description}</p>}
        {s.remarks && <p className="mt-2 rounded bg-gray-50 p-2 text-sm">{s.remarks}</p>}
        {activeRefill && (
          <Alert tone="info" className="mt-3" title={`Nachfüllanforderung: ${activeRefill.requestedQuantity} ${s.material.unit}`}>
            <RefillStatusBadge status={activeRefill.status} /> – <a className="underline" href={`/nachfuellung?id=${activeRefill.id}`}>zur Nachfüllliste</a>
          </Alert>
        )}
      </Card>

      {s.material.batchTracked && (
        <Card title="Chargen im Fahrzeug" padded={batchesWithStock.length === 0}>
          {batchesWithStock.length === 0 ? <p className="text-sm text-gray-600">Keine Chargen mit Bestand.</p> : (
            <TableWrap>
              <table className="table-base">
                <thead><tr><th>Charge</th><th>Verfallsdatum</th><th className="text-right">Menge</th></tr></thead>
                <tbody>
                  {batchesWithStock.map((b) => (
                    <tr key={b.id}><td>{b.batchNumber ?? "ohne Nummer"}</td><td><ExpiryBadge date={b.expiryDate} /></td><td className="text-right tabular-nums">{b.quantity} {s.material.unit}</td></tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      )}

      {can(actor, "materials.report") && !s.vehicle.archivedAt && (
        <Card title="Material austragen / fehlendes Material melden">
          <WriteOffForm
            userId={actor.id}
            vehicleId={id}
            title={`${s.vehicle.name} – ${s.material.name}`}
            stock={{
              id: s.id,
              unit: s.material.unit,
              batchTracked: s.material.batchTracked,
              currentQuantity: s.currentQuantity,
              batches: batchesWithStock.map((b) => ({ id: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate?.toISOString() ?? null, quantity: b.quantity })),
            }}
          />
        </Card>
      )}

      {manage && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Inventur / Bestandskorrektur">
            <ActionForm action={correctStockAction.bind(null, path)} resetOnSuccess>
              <input type="hidden" name="stockId" value={s.id} />
              {s.material.batchTracked && (
                <>
                  <SelectInput label="Charge" name="batchId" placeholder="– neue Charge einbuchen –" options={s.batches.map((b) => ({ value: b.id, label: `${b.batchNumber ?? "o. Nr."} · ${fmtDate(b.expiryDate)} · ${b.quantity}` }))} />
                  <Checkbox name="newBatch" label="Neue Charge einbuchen" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextInput label="Chargennummer (neu)" name="batchNumber" />
                    <TextInput label="Verfallsdatum (neu)" name="expiryDate" type="date" />
                  </div>
                </>
              )}
              <TextInput label="Gezählte Menge" name="countedQuantity" type="number" inputMode="numeric" min={0} required hint="Die Differenz wird als Korrekturbewegung gebucht" />
              <TextArea label="Begründung" name="note" required rows={2} />
              <SubmitButton variant="secondary">Korrektur buchen</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Position bearbeiten">
            <ActionForm action={updateStockAction.bind(null, stockId, path)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput label="Sollbestand" name="targetQuantity" type="number" min={0} defaultValue={s.targetQuantity} required />
                <TextInput label="Mindestbestand" name="minQuantity" type="number" min={0} defaultValue={s.minQuantity} required />
              </div>
              <TextInput label="Fach / Schrank / Tasche" name="compartment" defaultValue={s.compartment ?? ""} />
              <SelectInput label="Nachfülllager" name="refillLocationId" defaultValue={s.refillLocationId ?? ""} placeholder="– kein –" options={locations.map((l) => ({ value: l.id, label: `${l.warehouse.name} – ${l.name}` }))} />
              <TextArea label="Bemerkungen" name="remarks" defaultValue={s.remarks ?? ""} rows={2} />
              <SubmitButton variant="secondary">Speichern</SubmitButton>
            </ActionForm>
            <div className="mt-4 border-t pt-4">
              <InlineAction action={deactivateStockAction.bind(null, stockId, id)} variant="danger" confirm="Position aus dem Fahrzeug entfernen? (nur ohne Bestand möglich; Historie bleibt erhalten)">Position entfernen</InlineAction>
            </div>
          </Card>
        </div>
      )}

      <Card title="Bewegungshistorie" padded={s.movements.length === 0}>
        {s.movements.length === 0 ? <p className="text-sm text-gray-600">Noch keine Buchungen.</p> : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Zeitpunkt</th><th>Art</th><th className="text-right">Menge</th><th>Charge</th><th>Benutzer</th><th>Bemerkung</th></tr></thead>
              <tbody>
                {s.movements.map((m) => {
                  const delta = m.fromVehicleStockId === s.id ? -Math.abs(m.quantity) : Math.abs(m.quantity);
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{fmtDateTime(m.createdAt)}</td>
                      <td>{MOVEMENT_TYPE[m.type]}{m.reason ? ` – ${MOVEMENT_REASON[m.reason]}` : ""}</td>
                      <td className={`text-right font-semibold tabular-nums ${delta < 0 ? "text-drk-700" : "text-green-700"}`}>{delta > 0 ? `+${delta}` : delta}</td>
                      <td className="whitespace-nowrap">{m.batchNumber ?? ""}{m.expiryDate ? ` (${fmtDate(m.expiryDate)})` : ""}</td>
                      <td>{m.user.firstName} {m.user.lastName}</td>
                      <td>
                        {m.note}
                        {m.attachments.map((a) => <a key={a.id} href={`/api/files/${a.id}`} target="_blank" className="ml-1 text-drk-600 underline">Foto</a>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
