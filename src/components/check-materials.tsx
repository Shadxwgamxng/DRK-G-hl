"use client";

import clsx from "clsx";
import { Check, MapPin, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { Alert, Badge } from "./ui";

export type CheckStock = {
  id: string;
  name: string;
  unit: string;
  compartment: string | null;
  /** Ortshinweis(e) von Schrank und Fach */
  locationHint?: string | null;
  category: string;
  target: number;
  current: number;
  isEquipment: boolean;
  isNarcotic: boolean;
  batchTracked: boolean;
  batches: { id: string; batchNumber: string | null; expiryDate: string | null; quantity: number }[];
};

export type NewBatchState = { expiryDate: string; batchNumber: string; quantity: string };
export type MaterialState = {
  status?: "OK" | "DEVIATION" | "DEFECT";
  counted?: string;
  batches?: Record<string, { counted: string; expiredRemoved?: boolean }>;
  newBatches?: NewBatchState[];
  note?: string;
};

const NO_COMPARTMENT = "Ohne Lagerort";

/** Gebuchte Stücke ohne Verfallsdatum (z. B. nach nachträglichem Einschalten von „Mit Verfallsdatum“). */
const undatedQty = (s: CheckStock) => s.batches.filter((b) => !b.expiryDate).reduce((n, b) => n + b.quantity, 0);
/** Verfallsdatum (MHD) muss angegeben werden: Soll höher als gebucht oder Stücke ohne MHD. */
const needsExpiry = (s: CheckStock) => s.batchTracked && (s.current < s.target || undatedQty(s) > 0);

/** Wandelt den Formularzustand in die Nutzdaten für den Server um. */
export function materialPayload(stocks: CheckStock[], state: Record<string, MaterialState>) {
  return stocks.map((s) => {
    const m = state[s.id] ?? {};
    const dev = m.status === "DEVIATION";
    return {
      stockId: s.id,
      status: m.status,
      counted: dev && !s.batchTracked ? (m.counted ?? String(s.current)) : undefined,
      batches:
        dev && s.batchTracked
          ? s.batches.map((b) => ({ batchId: b.id, counted: !b.expiryDate ? "0" : (m.batches?.[b.id]?.counted ?? String(b.quantity)), expiredRemoved: Boolean(m.batches?.[b.id]?.expiredRemoved) }))
          : undefined,
      newBatches: dev && s.batchTracked ? (m.newBatches ?? []).filter((n) => n.expiryDate || n.quantity || n.batchNumber) : undefined,
      note: m.note?.trim() || undefined,
    };
  });
}

/** Clientseitige Vollständigkeitsprüfung; liefert die erste fehlerhafte Position. */
export function materialProblems(stocks: CheckStock[], state: Record<string, MaterialState>) {
  const fields: Record<string, string> = {};
  for (const s of stocks) {
    const m = state[s.id];
    if (!m?.status) fields[`mat_${s.id}`] = "Bitte prüfen";
    else if (m.status === "OK" && s.batchTracked && undatedQty(s) > 0) fields[`mat_${s.id}`] = "Bitte das Verfallsdatum (MHD) angeben";
    else if (m.status === "DEFECT" && !m.note?.trim()) fields[`matnote_${s.id}`] = "Bitte den Defekt beschreiben";
    else if (m.status === "DEVIATION")
      for (const n of m.newBatches ?? []) {
        if (!(n.expiryDate || n.quantity || n.batchNumber)) continue;
        if (!n.expiryDate || !Number(n.quantity)) fields[`mat_${s.id}`] = "Verfallsdatum und Menge angeben";
        else if (s.isNarcotic && !n.batchNumber.trim()) fields[`mat_${s.id}`] = "Chargennummer ist bei BtM Pflicht";
      }
  }
  return fields;
}

export function CheckMaterials({
  stocks,
  state,
  onChange,
  errors,
  today,
  warnDays,
  hiddenNarcotics,
  vehicleId,
}: {
  stocks: CheckStock[];
  state: Record<string, MaterialState>;
  onChange: (next: Record<string, MaterialState>) => void;
  errors?: Record<string, string>;
  today: string;
  warnDays: number;
  hiddenNarcotics: number;
  vehicleId: string;
}) {
  const set = (id: string, patch: MaterialState) => onChange({ ...state, [id]: { ...state[id], ...patch } });
  const groups = new Map<string, CheckStock[]>();
  for (const s of stocks) {
    const key = s.compartment?.trim() || NO_COMPARTMENT;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const soon = new Date(new Date(today).getTime() + warnDays * 86400000).toISOString().slice(0, 10);
  const done = stocks.filter((s) => state[s.id]?.status).length;

  if (stocks.length === 0) {
    return (
      <div className="card p-4">
        <h3 className="text-lg font-bold">Material</h3>
        <p className="mt-1 text-sm text-gray-600">
          Für dieses Fahrzeug ist noch keine Beladung hinterlegt. Unter{" "}
          <a href={`/fahrzeuge/${vehicleId}/material`} className="text-link">Material</a> können Fächer und Soll-Mengen angelegt werden – danach erscheinen sie bei jeder Kontrolle.
        </p>
        {hiddenNarcotics > 0 && <p className="mt-2 text-sm text-gray-600">{hiddenNarcotics} BtM-Position(en) werden nur Berechtigten angezeigt.</p>}
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-labelledby="mat-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="mat-heading" className="text-lg font-bold">Material – Fach für Fach</h3>
        <span className="text-sm font-semibold">{done} / {stocks.length} geprüft</span>
      </div>
      <p className="text-sm text-gray-600">
        „Vollständig“ heißt: Die Soll-Menge ist vorhanden. Fehlt etwas oder ist mehr da, unter „Abweichung“ die tatsächliche Menge eintragen –
        Fehlmengen kommen automatisch auf die Nachfüllliste.
      </p>
      {hiddenNarcotics > 0 && <Alert tone="info">{hiddenNarcotics} BtM-Position(en) werden nur Personen mit BtM-Berechtigung angezeigt und von diesen geprüft.</Alert>}

      {[...groups.entries()].map(([compartment, list]) => {
        const open = list.filter((s) => !state[s.id]?.status);
        // Material mit Verfallsdatum, das noch nicht (vollständig) gebucht ist, braucht ein Verfallsdatum – nicht pauschal abhaken
        const quick = open.filter((s) => !needsExpiry(s));
        return (
          <div key={compartment} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-drkblue-50 px-4 py-2">
              <div className="min-w-0">
                <h4 className="font-bold text-drkblue-900">{compartment}</h4>
                {list[0].locationHint && (
                  <p className="mt-0.5 flex gap-1.5 whitespace-pre-line text-sm text-drkblue-900">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {list[0].locationHint}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span>{list.length - open.length} / {list.length}</span>
                {quick.length > 0 && (
                  <button
                    type="button"
                    className="min-h-10 rounded-sm px-2 font-semibold text-green-800 hover:bg-green-50"
                    onClick={() => onChange({ ...state, ...Object.fromEntries(quick.map((s) => [s.id, { ...state[s.id], status: "OK" as const }])) })}
                  >
                    Übrige im Fach „Vollständig“
                  </button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-gray-200">
              {list.map((s) => {
                const m = state[s.id] ?? {};
                const err = errors?.[`mat_${s.id}`];
                const noteErr = errors?.[`matnote_${s.id}`];
                const expired = s.batches.filter((b) => b.expiryDate && b.expiryDate.slice(0, 10) < today);
                const startDeviation = (prefillMissing = false) =>
                  set(s.id, {
                    status: "DEVIATION",
                    counted: m.counted ?? String(prefillMissing ? s.target : s.current),
                    batches: m.batches ?? Object.fromEntries(s.batches.map((b) => [b.id, { counted: String(b.quantity) }])),
                    newBatches:
                      m.newBatches ??
                      (s.batchTracked && (s.batches.length === 0 || prefillMissing || undatedQty(s) > 0)
                        ? [{ expiryDate: "", batchNumber: "", quantity: String(undatedQty(s) + (prefillMissing ? Math.max(0, s.target - s.current) : 0) || "") }]
                        : []),
                  });
                // „Vollständig“: bei fehlender Buchung mit Verfallsdatum direkt die Zeile für die übrigen Stücke öffnen
                const markComplete = () => (needsExpiry(s) ? startDeviation(true) : set(s.id, { status: "OK" }));
                return (
                  <li key={s.id} id={`mat-${s.id}`} className={clsx("p-4", m.status === "DEFECT" && "bg-drk-50/40", (err || noteErr) && "ring-2 ring-inset ring-amber-400")}>
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <p className="font-semibold">
                        {s.name}
                        {s.isNarcotic && <Badge tone="red" className="ml-2">BtM</Badge>}
                        {s.isEquipment && <Badge tone="gray" className="ml-2">Gerät</Badge>}
                      </p>
                      <p className="text-sm text-gray-600">
                        Soll {s.target} · gebucht <strong>{s.current}</strong> {s.unit}
                        {s.current < s.target && <span className="ml-1 font-semibold text-amber-800">(fehlen {s.target - s.current})</span>}
                      </p>
                    </div>
                    {s.batchTracked && s.batches.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {s.batches.map((b) => {
                          const d = b.expiryDate?.slice(0, 10);
                          const tone = d && d < today ? "red" : d && d <= soon ? "yellow" : "gray";
                          return (
                            <Badge key={b.id} tone={tone}>
                              {b.quantity} × {b.expiryDate ? `bis ${fmtDate(b.expiryDate)}` : "Verfallsdatum noch nicht erfasst"}
                              {b.batchNumber ? ` · Ch. ${b.batchNumber}` : ""}
                              {tone === "red" ? " – abgelaufen" : ""}
                            </Badge>
                          );
                        })}
                      </div>
                    )}

                    <div className={clsx("mt-3 grid gap-2", s.isEquipment ? "grid-cols-3" : "grid-cols-2")} role="radiogroup" aria-label={s.name}>
                      <ChoiceButton active={m.status === "OK"} onClick={markComplete} cls="bg-green-700 text-white border-green-700" icon={<Check className="h-5 w-5" aria-hidden />}>
                        {s.isEquipment ? "Vorhanden & funktioniert" : "Vollständig"}
                      </ChoiceButton>
                      <ChoiceButton active={m.status === "DEVIATION"} onClick={() => startDeviation()} cls="bg-amber-600 text-white border-amber-600" icon={<Pencil className="h-5 w-5" aria-hidden />}>
                        Abweichung
                      </ChoiceButton>
                      {s.isEquipment && (
                        <ChoiceButton active={m.status === "DEFECT"} onClick={() => set(s.id, { status: "DEFECT" })} cls="bg-drk-500 text-white border-drk-500" icon={<Wrench className="h-5 w-5" aria-hidden />}>
                          Defekt
                        </ChoiceButton>
                      )}
                    </div>
                    {!m.status && undatedQty(s) > 0 && (
                      <p className="mt-2 text-sm font-semibold text-drkblue-900">Verfallsdatum (MHD) für {undatedQty(s)} {s.unit} fehlt – bitte bei dieser Kontrolle angeben.</p>
                    )}
                    {m.status === "OK" && expired.length > 0 && (
                      <p className="mt-2 text-sm font-semibold text-drk-700">Abgelaufene Stücke vorhanden – bitte unter „Abweichung“ als entnommen markieren.</p>
                    )}

                    {m.status === "DEVIATION" && !s.batchTracked && (
                      <div className="mt-3 max-w-xs">
                        <label className="label" htmlFor={`cnt-${s.id}`}>Tatsächlich vorhanden ({s.unit})</label>
                        <input id={`cnt-${s.id}`} className="input" type="number" inputMode="numeric" min={0} value={m.counted ?? ""} onChange={(e) => set(s.id, { counted: e.target.value })} />
                      </div>
                    )}

                    {m.status === "OK" && s.current < s.target && !s.batchTracked && (
                      <p className="mt-2 text-sm text-green-800">Wird mit der Soll-Menge ({s.target} {s.unit}) gebucht.</p>
                    )}
                    {m.status === "DEVIATION" && s.batchTracked && (
                      <div className="mt-3 space-y-2">
                        {needsExpiry(s) && (
                          <p className="text-sm font-semibold text-drkblue-900">
                            {undatedQty(s) > 0
                              ? `${undatedQty(s)} ${s.unit} ohne Verfallsdatum (MHD) – bitte unten mit MHD erfassen`
                              : `Erst ${s.current} von ${s.target} ${s.unit} erfasst – bitte das Verfallsdatum der übrigen Stücke eintragen`}{" "}
                            (bei unterschiedlichen Daten weitere Zeile hinzufügen).
                          </p>
                        )}
                        {s.batches.filter((b) => b.expiryDate).map((b) => {
                          const row = m.batches?.[b.id] ?? { counted: String(b.quantity) };
                          const isExpired = Boolean(b.expiryDate && b.expiryDate.slice(0, 10) < today);
                          return (
                            <div key={b.id} className="flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 p-2">
                              <div className="min-w-36">
                                <span className="text-xs text-gray-500">Verfallsdatum</span>
                                <p className={clsx("font-semibold", isExpired && "text-drk-700")}>{fmtDate(b.expiryDate, "ohne")}{b.batchNumber ? <span className="font-normal text-gray-500"> · Ch. {b.batchNumber}</span> : null}</p>
                              </div>
                              <div className="w-28">
                                <label className="text-xs text-gray-500" htmlFor={`b-${b.id}`}>Vorhanden</label>
                                <input
                                  id={`b-${b.id}`}
                                  className="input"
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  disabled={row.expiredRemoved}
                                  value={row.expiredRemoved ? "0" : row.counted}
                                  onChange={(e) => set(s.id, { batches: { ...m.batches, [b.id]: { ...row, counted: e.target.value } } })}
                                />
                              </div>
                              {isExpired && (
                                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-drk-700">
                                  <input type="checkbox" className="h-5 w-5 accent-drk-500" checked={Boolean(row.expiredRemoved)} onChange={(e) => set(s.id, { batches: { ...m.batches, [b.id]: { ...row, expiredRemoved: e.target.checked } } })} />
                                  abgelaufen – entnommen
                                </label>
                              )}
                            </div>
                          );
                        })}
                        {(m.newBatches ?? []).map((n, i) => {
                          const upd = (patch: Partial<NewBatchState>) => set(s.id, { newBatches: (m.newBatches ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                          return (
                            <div key={i} className="flex flex-wrap items-end gap-3 rounded-sm border border-dashed border-drkblue-300 bg-drkblue-50/40 p-2">
                              <div className="w-44">
                                <label className="text-xs text-gray-500" htmlFor={`nd-${s.id}-${i}`}>Verfallsdatum</label>
                                <input id={`nd-${s.id}-${i}`} className="input" type="date" value={n.expiryDate} onChange={(e) => upd({ expiryDate: e.target.value })} />
                              </div>
                              <div className="w-28">
                                <label className="text-xs text-gray-500" htmlFor={`nq-${s.id}-${i}`}>Menge</label>
                                <input id={`nq-${s.id}-${i}`} className="input" type="number" inputMode="numeric" min={1} value={n.quantity} onChange={(e) => upd({ quantity: e.target.value })} />
                              </div>
                              <div className="w-44">
                                <label className="text-xs text-gray-500" htmlFor={`nb-${s.id}-${i}`}>Chargennr. {s.isNarcotic ? <span className="text-drk-600">(Pflicht)</span> : "(optional)"}</label>
                                <input id={`nb-${s.id}-${i}`} className="input" value={n.batchNumber} onChange={(e) => upd({ batchNumber: e.target.value })} />
                              </div>
                              <button type="button" className="min-h-11 rounded-sm px-2 text-gray-600 hover:bg-gray-100" aria-label="Zeile entfernen" onClick={() => set(s.id, { newBatches: (m.newBatches ?? []).filter((_, j) => j !== i) })}>
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-drkblue-700 hover:underline"
                          onClick={() => set(s.id, { newBatches: [...(m.newBatches ?? []), { expiryDate: "", batchNumber: "", quantity: "" }] })}
                        >
                          <Plus className="h-4 w-4" /> Stücke mit {s.batches.length ? "anderem " : ""}Verfallsdatum erfassen
                        </button>
                      </div>
                    )}

                    {(m.status === "DEVIATION" || m.status === "DEFECT") && (
                      <div className="mt-3">
                        <label className="label" htmlFor={`mn-${s.id}`}>
                          Bemerkung{m.status === "DEFECT" && <span className="text-drk-600"> *</span>}
                        </label>
                        <input id={`mn-${s.id}`} className="input" value={m.note ?? ""} placeholder={m.status === "DEFECT" ? "Was ist defekt?" : "optional, z. B. verbraucht bei Einsatz …"} onChange={(e) => set(s.id, { note: e.target.value })} />
                        {noteErr && <p className="mt-1 text-sm text-drk-700">{noteErr}</p>}
                        {m.status === "DEFECT" && <p className="mt-1 text-xs text-gray-500">Wird beim Abschluss automatisch als Mangel gemeldet.</p>}
                      </div>
                    )}
                    {err && <p className="mt-2 text-sm font-semibold text-drk-700">{err}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function ChoiceButton({ active, onClick, cls, icon, children }: { active: boolean; onClick: () => void; cls: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx("flex min-h-12 items-center justify-center gap-2 rounded-sm border-2 px-2 text-sm font-bold", active ? clsx(cls, "anim-select") : "border-gray-200 bg-white text-gray-700")}
    >
      {icon} {children}
    </button>
  );
}
