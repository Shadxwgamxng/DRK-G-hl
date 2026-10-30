"use client";

import { useActionState, useMemo, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Minus, Plus, Search } from "lucide-react";
import { matches } from "@/lib/search-match";
import type { ConsumptionResult } from "@/app/actions/consumption";
import { Alert } from "./ui";
import { SubmitButton } from "./forms";

type Item = { stockId: string; name: string; unit: string; location: string };

export function ConsumptionForm({
  action,
  vehicle,
  items,
  occasions,
  today,
}: {
  action: (s: ConsumptionResult, fd: FormData) => Promise<ConsumptionResult>;
  vehicle: string;
  items: Item[];
  occasions: readonly string[];
  today: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [occasion, setOccasion] = useState("");
  const total = Object.values(qty).reduce((n, v) => n + v, 0);
  const visible = useMemo(() => items.filter((i) => !q.trim() || matches(`${i.name} ${i.location}`, q)), [items, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of visible) m.set(i.location, [...(m.get(i.location) ?? []), i]);
    return [...m.entries()];
  }, [visible]);
  const change = (id: string, d: number) => setQty((s) => ({ ...s, [id]: Math.max(0, Math.min(200, (s[id] ?? 0) + d)) }));

  if (state.ok && state.done) {
    return (
      <div className="anim-pop card p-5 text-center">
        <CheckCircle2 className="anim-check mx-auto h-14 w-14 text-green-700" aria-hidden />
        <h1 className="mt-3 text-2xl font-bold">Danke!</h1>
        <p className="mt-1 text-gray-700">Der Verbrauch für <strong>{state.done.vehicle}</strong> wurde gemeldet und steht auf der Nachfüllliste.</p>
        <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200 text-left text-sm">
          {state.done.lines.map((l) => (
            <li key={l.material} className="flex justify-between gap-3 py-2">
              <span>{l.material}</span>
              <span className="font-semibold tabular-nums">{l.reported} {l.unit}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-500">Sie können dieses Fenster jetzt schließen.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-drkblue-600">Verbrauch melden</p>
        <h1 className="text-2xl font-bold">{vehicle}</h1>
        <p className="mt-1 text-sm text-gray-600">Nach Einsatz, Sanitätsdienst oder Veranstaltung: einfach eintragen, was verbraucht wurde – es landet automatisch auf der Nachfüllliste.</p>
      </div>
      {state.message && !state.ok && <Alert tone="error" title={state.message} />}

      <fieldset className="card space-y-4 p-4">
        <legend className="sr-only">Angaben zum Einsatz</legend>
        <div>
          <span className="label">Anlass *</span>
          <div className="flex flex-wrap gap-2">
            {occasions.map((o) => (
              <label key={o} className={clsx("cursor-pointer rounded-sm border-2 px-3 py-2 text-sm font-bold", occasion === o ? "border-drkblue-900 bg-drkblue-900 text-white" : "border-gray-200 bg-white")}>
                <input type="radio" name="occasion" value={o} className="sr-only" checked={occasion === o} onChange={() => setOccasion(o)} />
                {o}
              </label>
            ))}
          </div>
          {state.fieldErrors?.occasion && <p className="mt-1 text-sm text-drk-700">{state.fieldErrors.occasion}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="occurredOn">Datum *</label>
            <input id="occurredOn" name="occurredOn" type="date" className="input" defaultValue={today} max={today} />
          </div>
          <div>
            <label className="label" htmlFor="reporterName">Ihr Name *</label>
            <input id="reporterName" name="reporterName" className="input" autoComplete="name" placeholder="Vor- und Nachname" aria-invalid={Boolean(state.fieldErrors?.reporterName)} />
          </div>
        </div>
        {/* Honigtopf gegen automatisierte Eingaben */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      </fieldset>

      <section className="space-y-3" aria-label="Verbrauchtes Material">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
          <input className="input pl-10" placeholder="Material suchen, z. B. „kompresse“ oder „vvk 18“" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Material suchen" />
        </div>
        {groups.length === 0 && <p className="text-sm text-gray-600">Keine Treffer.</p>}
        {groups.map(([location, list]) => (
          <div key={location} className="card overflow-hidden">
            <h2 className="border-b border-gray-200 bg-drkblue-50 px-4 py-2 text-sm font-bold text-drkblue-900">{location}</h2>
            <ul className="divide-y divide-gray-200">
              {list.map((i) => {
                const n = qty[i.stockId] ?? 0;
                return (
                  <li key={i.stockId} className={clsx("flex items-center gap-3 px-4 py-2", n > 0 && "bg-green-50")}>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">{i.name}</span>
                      <span className="block text-xs text-gray-500">{i.unit}</span>
                    </span>
                    <button type="button" aria-label={`${i.name} weniger`} className="flex h-11 w-11 items-center justify-center rounded-sm border border-gray-300 bg-white disabled:opacity-40" disabled={!n} onClick={() => change(i.stockId, -1)}>
                      <Minus className="h-5 w-5" />
                    </button>
                    <span className={clsx("w-8 text-center text-lg font-bold tabular-nums", n ? "text-drkblue-900" : "text-gray-300")}>{n}</span>
                    <button type="button" aria-label={`${i.name} mehr`} className="flex h-11 w-11 items-center justify-center rounded-sm border border-drkblue-900 bg-drkblue-900 text-white" onClick={() => change(i.stockId, 1)}>
                      <Plus className="h-5 w-5" />
                    </button>
                    {n > 0 && <input type="hidden" name={`qty_${i.stockId}`} value={n} />}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {/* ausgewählte, aber gerade ausgefilterte Positionen trotzdem mitsenden */}
        {Object.entries(qty)
          .filter(([id, n]) => n > 0 && !visible.some((v) => v.stockId === id))
          .map(([id, n]) => <input key={id} type="hidden" name={`qty_${id}`} value={n} />)}
      </section>

      <div className="card p-4">
        <label className="label" htmlFor="note">Bemerkung (optional)</label>
        <textarea id="note" name="note" rows={2} className="input" placeholder="z. B. Patient mit Schnittverletzung, Rucksack noch nicht aufgefüllt" />
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-gray-300 bg-white/95 px-4 py-3 backdrop-blur">
        <SubmitButton size="lg" className="w-full">
          {total ? `${total} Teil(e) melden` : "Verbrauch melden"}
        </SubmitButton>
      </div>
    </form>
  );
}
