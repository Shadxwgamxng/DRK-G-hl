"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { saveChecklistAction } from "@/app/actions/admin";
import { Alert, Button } from "./ui";

type Item = { id?: string; label: string; description?: string | null; active: boolean };
export type ChecklistValue = { id?: string; name: string; description?: string | null; vehicleTypeId?: string | null; active: boolean; items: Item[] };

export function ChecklistEditor({ value, types, usedCount = 0 }: { value: ChecklistValue; types: { id: string; name: string }[]; usedCount?: number }) {
  const [v, setV] = useState<ChecklistValue>(value);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; message?: string; fieldErrors?: Record<string, string> } | null>(null);
  const setItem = (i: number, patch: Partial<Item>) => setV((p) => ({ ...p, items: p.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const move = (i: number, d: number) =>
    setV((p) => {
      const items = [...p.items];
      const j = i + d;
      if (j < 0 || j >= items.length) return p;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...p, items };
    });

  return (
    <div className="space-y-4">
      {usedCount > 0 && <Alert tone="info">Diese Checkliste wurde bereits {usedCount}× verwendet. Entfernte Prüfpunkte werden deaktiviert statt gelöscht, damit abgeschlossene Kontrollen unverändert nachvollziehbar bleiben.</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor={`n-${v.id ?? "new"}`}>Name *</label>
          <input id={`n-${v.id ?? "new"}`} className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`t-${v.id ?? "new"}`}>Gilt für Fahrzeugtyp</label>
          <select id={`t-${v.id ?? "new"}`} className="input" value={v.vehicleTypeId ?? ""} onChange={(e) => setV({ ...v, vehicleTypeId: e.target.value || null })}>
            <option value="">Standard (alle Typen ohne eigene Liste)</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor={`d-${v.id ?? "new"}`}>Hinweis für Prüfer</label>
          <input id={`d-${v.id ?? "new"}`} className="input" value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="h-6 w-6 accent-drk-500" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
        <span className="text-sm font-semibold">Aktiv (ersetzt eine andere aktive Liste desselben Typs)</span>
      </label>
      <ol className="space-y-2">
        {v.items.map((item, i) => (
          <li key={item.id ?? `new-${i}`} className={`rounded-lg border p-3 ${item.active ? "border-gray-200" : "border-dashed border-gray-300 opacity-60"}`}>
            <div className="flex flex-wrap items-start gap-2">
              <span className="mt-3 w-6 text-sm text-gray-400">{i + 1}.</span>
              <div className="min-w-0 flex-1 space-y-2">
                <input className="input" aria-label={`Prüfpunkt ${i + 1}`} value={item.label} onChange={(e) => setItem(i, { label: e.target.value })} placeholder="Prüfpunkt" />
                <input className="input min-h-10 text-sm" aria-label={`Erläuterung ${i + 1}`} value={item.description ?? ""} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Erläuterung (optional)" />
              </div>
              <div className="flex gap-1">
                <button type="button" className="rounded-lg p-2.5 hover:bg-gray-100" onClick={() => move(i, -1)} aria-label="Nach oben"><ArrowUp className="h-5 w-5" /></button>
                <button type="button" className="rounded-lg p-2.5 hover:bg-gray-100" onClick={() => move(i, 1)} aria-label="Nach unten"><ArrowDown className="h-5 w-5" /></button>
                <button type="button" className="rounded-lg p-2.5 text-drk-700 hover:bg-drk-50" onClick={() => (item.id ? setItem(i, { active: !item.active }) : setV({ ...v, items: v.items.filter((_, j) => j !== i) }))} aria-label={item.id ? (item.active ? "Deaktivieren" : "Aktivieren") : "Entfernen"}>
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
            {!item.active && <p className="ml-8 mt-1 text-xs">deaktiviert – wird bei neuen Kontrollen nicht abgefragt</p>}
          </li>
        ))}
      </ol>
      <Button type="button" variant="secondary" onClick={() => setV({ ...v, items: [...v.items, { label: "", active: true }] })}>
        <Plus className="h-5 w-5" /> Prüfpunkt hinzufügen
      </Button>
      {msg?.message && <Alert tone={msg.ok ? "success" : "error"} title={msg.message}>{msg.fieldErrors && Object.entries(msg.fieldErrors).map(([k, e]) => <div key={k}>{k}: {e}</div>)}</Alert>}
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await saveChecklistAction(JSON.stringify({ ...v, vehicleTypeId: v.vehicleTypeId || undefined, items: v.items.filter((x) => x.label.trim()) }));
            setMsg(res);
          })
        }
      >
        {pending && <Loader2 className="h-5 w-5 animate-spin" />} Checkliste speichern
      </Button>
    </div>
  );
}
