import Link from "next/link";
import { MapPin, PackageCheck } from "lucide-react";
import { requireActiveActor } from "@/server/auth/current";
import { can } from "@/server/actor";
import { listRefills } from "@/server/services/refills";
import { summarizeVehicles } from "@/server/services/vehicles";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { RefillStatusBadge } from "@/components/status";
import { ActionForm, InlineAction, SubmitButton, TextInput } from "@/components/forms";
import { cancelRefillAction, closeRefillAction, confirmRefillAction, provideRefillAction, startRefillAction } from "@/app/actions/refills";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { MOVEMENT_TYPE } from "@/lib/labels";

export const metadata = { title: "Nachfüllung" };

export default async function RefillPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActiveActor();
  const sp = await searchParams;
  const status = sp.status ?? "active";
  const [rows, vehicles] = await Promise.all([listRefills(actor, { status, vehicleId: sp.vehicleId, q: sp.q }), summarizeVehicles(actor)]);
  const process = can(actor, "refills.process");
  const confirm = can(actor, "refills.confirm");
  const tab = (s: string, label: string) => (
    <LinkButton size="sm" variant={status === s ? "primary" : "secondary"} href={`?status=${s}${sp.vehicleId ? `&vehicleId=${sp.vehicleId}` : ""}`}>{label}</LinkButton>
  );

  return (
    <>
      <PageHeader
        title="Nachfüllliste"
        subtitle="Automatisch aus Austragungen und Unterschreitungen des Sollbestands erzeugt"
        actions={can(actor, "reports.view") && (
          <>
            <LinkButton variant="secondary" href={`/api/export/nachfuellung?format=pdf&status=${status}${sp.vehicleId ? `&vehicleId=${sp.vehicleId}` : ""}`} prefetch={false}>Packliste PDF</LinkButton>
            <LinkButton variant="secondary" href={`/api/export/nachfuellung?format=csv&status=${status}`} prefetch={false}>CSV</LinkButton>
          </>
        )}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {tab("active", "Aktiv")}
        {tab("OPEN", "Offen")}
        {tab("IN_PROGRESS", "In Bearbeitung")}
        {tab("PROVIDED", "Bereitgestellt")}
        {tab("history", "Historie")}
      </div>
      <form className="filterbar mb-4 grid gap-3 p-3 sm:grid-cols-3">
        <input type="hidden" name="status" value={status} />
        <select name="vehicleId" defaultValue={sp.vehicleId ?? ""} className="input" aria-label="Fahrzeug">
          <option value="">Alle Fahrzeuge</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input name="q" defaultValue={sp.q} placeholder="Material suchen" className="input" aria-label="Material" />
        <button className="min-h-12 rounded-lg bg-drkblue-900 px-4 text-sm font-semibold text-white hover:bg-drkblue-600">Filtern</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<PackageCheck className="h-12 w-12 text-green-600" />} title={status === "history" ? "Keine abgeschlossenen Vorgänge" : "Kein Nachfüllbedarf"}>
          Sobald Material ausgetragen wird oder ein Bestand unter den Sollbestand fällt, erscheint hier automatisch ein Eintrag.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const s = r.vehicleStock;
            const active = ["OPEN", "IN_PROGRESS", "PROVIDED"].includes(r.status);
            return (
              <li key={r.id} id={r.id}>
                <Card className={sp.id === r.id ? "ring-2 ring-drk-500" : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold">
                        {r.requestedQuantity} {r.material.unit} · {r.material.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        <Link href={`/fahrzeuge/${r.vehicleId}/material/${r.vehicleStockId}`} className="font-semibold hover:text-drkblue-600">{r.vehicle.name}</Link> · Soll {s.targetQuantity} / Ist {s.currentQuantity}
                        {r.material.batchTracked && <Badge className="ml-2">chargengeführt</Badge>}
                      </p>
                      <p className="mt-1 text-sm">Grund: {r.reason}</p>
                      <p className="text-xs text-gray-500">Gemeldet {fmtDateTime(r.createdAt)} von {r.reportedBy.firstName} {r.reportedBy.lastName}</p>
                    </div>
                    <RefillStatusBadge status={r.status} />
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-gray-50 p-3 text-sm">
                      <p className="flex items-center gap-1 font-semibold"><MapPin className="h-4 w-4" /> Einräumen im Fahrzeug</p>
                      <p>{s.compartment ?? "kein Fach hinterlegt"}</p>
                      <p className="mt-2 flex items-center gap-1 font-semibold"><MapPin className="h-4 w-4" /> Nachfülllager</p>
                      <p>{s.refillLocation ? `${s.refillLocation.warehouse.name} – ${s.refillLocation.name}` : "nicht hinterlegt"}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 text-sm">
                      <p className="font-semibold">Bestand im Zentrallager</p>
                      {r.warehouseStocks.length === 0 ? <p className="text-drk-700">Kein Lagerbestand vorhanden</p> : (
                        <ul className="mt-1 space-y-0.5">
                          {r.warehouseStocks.map((w) => (
                            <li key={w.id}>
                              <b>{w.location.warehouse.name} – {w.location.name}</b>: {w.quantity} {r.material.unit}
                              {w.batches.length > 0 && <span className="text-xs text-gray-600"> ({w.batches.map((b) => `${b.batchNumber ?? "o. Nr."}: ${b.quantity}, Verfall ${fmtDate(b.expiryDate)}`).join("; ")})</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {r.movements.length > 0 && (
                    <ul className="mt-3 space-y-0.5 text-xs text-gray-600">
                      {r.movements.map((m) => (
                        <li key={m.id}>{fmtDateTime(m.createdAt)} · {MOVEMENT_TYPE[m.type]} {Math.abs(m.quantity)} {m.batchNumber ? `(Charge ${m.batchNumber})` : ""}</li>
                      ))}
                    </ul>
                  )}
                  {r.status === "PROVIDED" && <p className="mt-2 text-sm font-semibold text-amber-800">Bereitgestellt: {r.providedQuantity} {r.material.unit} von {r.providedBy?.firstName} {r.providedBy?.lastName} – bitte nach dem Einräumen die tatsächliche Menge bestätigen.</p>}
                  {r.refilledQuantity != null && <p className="mt-2 text-sm font-semibold text-green-800">Nachgefüllt: {r.refilledQuantity} {r.material.unit} am {fmtDateTime(r.confirmedAt)} ({r.confirmedBy?.firstName} {r.confirmedBy?.lastName})</p>}
                  {r.notes && <details className="mt-2 text-xs text-gray-600"><summary className="cursor-pointer">Notizen</summary><p className="whitespace-pre-line">{r.notes}</p></details>}

                  {(active || r.status === "REFILLED") && (
                    <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-gray-100 pt-4">
                      {process && r.status === "OPEN" && <InlineAction action={startRefillAction.bind(null, r.id)} variant="secondary" size="md">Übernehmen</InlineAction>}
                      {r.status === "REFILLED" && (process || confirm) && <InlineAction action={closeRefillAction.bind(null, r.id)} variant="success" size="md">Als erledigt abschließen</InlineAction>}
                    </div>
                  )}

                  {active && process && r.warehouseStocks.length > 0 && r.status !== "PROVIDED" && (
                    <details className="mt-3 rounded-lg border border-gray-200 p-3">
                      <summary className="cursor-pointer font-semibold">Material aus dem Lager bereitstellen</summary>
                      <ActionForm action={provideRefillAction.bind(null, r.id)} className="mt-3">
                        {r.warehouseStocks.flatMap((w) =>
                          r.material.batchTracked
                            ? w.batches.map((b) => (
                                <TextInput key={b.id} name={`qty_${w.id}__${b.id}`} type="number" min={0} max={b.quantity} inputMode="numeric" label={`${w.location.name} · Charge ${b.batchNumber ?? "o. Nr."} · Verfall ${fmtDate(b.expiryDate)} (verfügbar ${b.quantity})`} />
                              ))
                            : [<TextInput key={w.id} name={`qty_${w.id}`} type="number" min={0} max={w.quantity} inputMode="numeric" label={`${w.location.warehouse.name} – ${w.location.name} (verfügbar ${w.quantity})`} defaultValue={Math.min(w.quantity, r.requestedQuantity)} />],
                        )}
                        <TextInput label="Notiz" name="note" />
                        <SubmitButton>Entnehmen & bereitstellen</SubmitButton>
                      </ActionForm>
                    </details>
                  )}

                  {active && confirm && (
                    <details className="mt-3 rounded-lg border border-gray-200 p-3" open={r.status === "PROVIDED"}>
                      <summary className="cursor-pointer font-semibold">Nachfüllung im Fahrzeug bestätigen</summary>
                      <ActionForm action={confirmRefillAction.bind(null, r.id)} className="mt-3">
                        <TextInput label={`Tatsächlich eingeräumte Menge (${r.material.unit})`} name="quantity" type="number" inputMode="numeric" min={1} required defaultValue={r.providedQuantity ?? r.requestedQuantity} hint={r.status === "PROVIDED" ? "Nicht benötigte Restmengen werden automatisch ins Lager zurückgebucht." : "Erst mit dieser Bestätigung wird der Fahrzeugbestand erhöht."} />
                        {r.material.batchTracked && r.status !== "PROVIDED" && (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <TextInput label="Chargennummer" name="batchNumber" />
                            <TextInput label="Verfallsdatum *" name="batchExpiry" type="date" />
                          </div>
                        )}
                        <TextInput label="Notiz" name="note" />
                        <SubmitButton variant="success">Nachfüllung bestätigen</SubmitButton>
                      </ActionForm>
                    </details>
                  )}

                  {active && process && (
                    <details className="mt-3 rounded-lg border border-gray-200 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-drk-700">Anforderung stornieren</summary>
                      <ActionForm action={cancelRefillAction.bind(null, r.id)} className="mt-3">
                        <TextInput label="Grund" name="reason" required />
                        <SubmitButton variant="danger" confirm="Anforderung wirklich stornieren? Bereitgestelltes Material wird ins Lager zurückgebucht.">Stornieren</SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
