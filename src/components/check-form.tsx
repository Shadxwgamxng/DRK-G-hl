"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, CloudOff, Loader2, Minus, TriangleAlert } from "lucide-react";
import { listDrafts, newClientRef, saveDraft, submitDraft, type Draft } from "@/lib/offline-store";
import { CHECK_TYPE, DEFECT_CATEGORY, DEFECT_SEVERITY } from "@/lib/labels";
import { LocalFilePicker } from "./Uploader";
import { Alert, Button } from "./ui";
import { useOnline } from "./pwa";
import { CheckMaterials, materialPayload, materialProblems, type CheckStock, type MaterialState } from "./check-materials";

type Item = { id: string; label: string; description: string | null };
type Result = { result?: "OK" | "DEFECT" | "NOT_APPLICABLE"; note?: string; createDefect?: boolean; title?: string; severity?: string; category?: string };

export function CheckForm({
  userId,
  vehicle,
  checklist,
  draftId,
  materials,
}: {
  userId: string;
  vehicle: { id: string; name: string; mileage: number | null };
  checklist: { id: string; name: string; description: string | null; items: Item[] };
  draftId?: string;
  materials: { stocks: CheckStock[]; hiddenNarcotics: number; today: string; warnDays: number; loadedAt: string };
}) {
  const router = useRouter();
  const online = useOnline();
  const [results, setResults] = useState<Record<string, Result>>({});
  const [matState, setMatState] = useState<Record<string, MaterialState>>({});
  const [checkType, setCheckType] = useState("ROUTINE");
  const [mileage, setMileage] = useState("");
  const [remarks, setRemarks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [clientRef, setClientRef] = useState<string>(() => draftId ?? newClientRef());

  // vorhandenen Entwurf (z. B. nach Konflikt) laden
  useEffect(() => {
    if (!draftId) return;
    listDrafts(userId).then((all) => {
      const d = all.find((x) => x.id === draftId);
      if (!d) return;
      const p = d.payload as {
        checkType: string;
        mileage?: string;
        remarks?: string;
        results: { itemId: string; result: Result["result"]; note?: string; defect?: { title: string; severity: string; category: string } }[];
        materials?: ReturnType<typeof materialPayload>;
      };
      setCheckType(p.checkType);
      setMileage(p.mileage ?? "");
      setRemarks(p.remarks ?? "");
      setResults(Object.fromEntries(p.results.map((r) => [r.itemId, { result: r.result, note: r.note, createDefect: Boolean(r.defect), ...r.defect }])));
      setMatState(
        Object.fromEntries(
          (p.materials ?? []).map((m) => [
            m.stockId,
            {
              status: m.status,
              counted: m.counted,
              note: m.note,
              newBatches: m.newBatches,
              batches: m.batches ? Object.fromEntries(m.batches.map((b) => [b.batchId, { counted: b.counted, expiredRemoved: b.expiredRemoved }])) : undefined,
            } satisfies MaterialState,
          ]),
        ),
      );
      setFiles(d.files.map((f) => new File([f.blob], f.name, { type: f.type })));
      setError(d.message ? { message: d.message } : null);
      setClientRef(d.id);
    });
  }, [draftId, userId]);

  const answered = checklist.items.filter((i) => results[i.id]?.result).length;
  const defects = checklist.items.filter((i) => results[i.id]?.result === "DEFECT").length;
  const set = (id: string, patch: Result) => setResults((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const payload = useMemo(
    () => ({
      checklistId: checklist.id,
      checkType,
      mileage,
      remarks,
      performedAt: new Date().toISOString(),
      materialsLoadedAt: materials.loadedAt,
      materials: materialPayload(materials.stocks, matState),
      results: checklist.items.map((i) => {
        const r = results[i.id] ?? {};
        return {
          itemId: i.id,
          result: r.result,
          note: r.note,
          defect: r.result === "DEFECT" && r.createDefect ? { title: r.title || i.label, severity: r.severity || "MEDIUM", category: r.category || "OTHER", description: r.note } : undefined,
        };
      }),
    }),
    [checklist, checkType, mileage, remarks, results, materials, matState],
  );

  async function submit() {
    setError(null);
    const missing = checklist.items.filter((i) => !results[i.id]?.result);
    if (missing.length) {
      setError({ message: `Bitte alle Prüfpunkte bewerten (${missing.length} offen).` });
      document.getElementById(`item-${missing[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const matFields = materialProblems(materials.stocks, matState);
    const firstMat = materials.stocks.find((s) => matFields[`mat_${s.id}`] || matFields[`matnote_${s.id}`]);
    if (firstMat) {
      const open = materials.stocks.filter((s) => !matState[s.id]?.status).length;
      setError({ message: open ? `Bitte alle Materialpositionen prüfen (${open} offen).` : "Bitte die markierten Materialpositionen vervollständigen.", fields: matFields });
      document.getElementById(`mat-${firstMat.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    const draft: Draft = {
      id: clientRef,
      kind: "check",
      userId,
      vehicleId: vehicle.id,
      title: `${vehicle.name} – ${CHECK_TYPE[checkType]}`,
      payload,
      files: files.map((f) => ({ name: f.name, type: f.type, blob: f })),
      createdAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
    };
    const res = navigator.onLine ? await submitDraft(draft) : ({ ok: false, offline: true } as const);
    setBusy(false);
    if (res.ok) {
      if (draftId) await import("@/lib/offline-store").then((m) => m.deleteDraft(draftId));
      router.push(`/fahrzeuge/${vehicle.id}/kontrollen/${res.id}?neu=1`);
      router.refresh();
    } else if (res.offline) {
      await saveDraft(draft);
      setOfflineSaved(true);
    } else {
      setError({ message: res.message, fields: res.fieldErrors });
    }
  }

  if (offlineSaved) {
    return (
      <Alert tone="warning" title="Offline gespeichert – noch nicht synchronisiert">
        Die Kontrolle wurde auf diesem Gerät gespeichert und wird automatisch übertragen, sobald wieder eine Verbindung besteht. Den Status sehen Sie unter <a href="/sync" className="font-semibold underline">Synchronisation</a>.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {checklist.description && <Alert tone="info">{checklist.description}</Alert>}
      <div className="card grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="checkType">Kontrollart</label>
          <select id="checkType" className="input" value={checkType} onChange={(e) => setCheckType(e.target.value)}>
            {Object.entries(CHECK_TYPE).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mileage">Kilometerstand</label>
          <input id="mileage" className="input" type="number" inputMode="numeric" value={mileage} placeholder={vehicle.mileage ? `zuletzt ${vehicle.mileage.toLocaleString("de-DE")}` : ""} onChange={(e) => setMileage(e.target.value)} />
        </div>
      </div>

      <div className="sticky top-[57px] z-10 -mx-4 flex items-center justify-between gap-2 border-y border-gray-200 bg-white/95 px-4 py-2 text-sm backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <span className="font-semibold">
          {answered} / {checklist.items.length} bewertet
          {materials.stocks.length > 0 && <span className="ml-2 font-normal text-gray-600">· Material {materials.stocks.filter((s) => matState[s.id]?.status).length} / {materials.stocks.length}</span>}
          {defects ? <span className="ml-2 text-drk-600">· {defects} Mangel</span> : null}
        </span>
        <button
          type="button"
          className="min-h-10 rounded-lg px-3 font-semibold text-green-800 hover:bg-green-50"
          onClick={() => setResults((r) => Object.fromEntries(checklist.items.map((i) => [i.id, r[i.id]?.result ? r[i.id] : { result: "OK" as const }])))}
        >
          Übrige „In Ordnung“
        </button>
      </div>

      <ol className="space-y-3">
        {checklist.items.map((item, idx) => {
          const r = results[item.id] ?? {};
          const noteErr = error?.fields?.[`note_${item.id}`];
          return (
            <li key={item.id} id={`item-${item.id}`} className={clsx("card p-4", r.result === "DEFECT" && "border-drk-300 bg-drk-50/40", !r.result && error && "ring-2 ring-amber-400")}>
              <p className="font-semibold">
                <span className="mr-2 text-drk-500">{idx + 1}.</span>
                {item.label}
              </p>
              {item.description && <p className="mt-0.5 text-sm text-gray-600">{item.description}</p>}
              <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label={item.label}>
                {([
                  ["OK", "In Ordnung", Check, "bg-green-700 text-white border-green-700"],
                  ["DEFECT", "Mangel", TriangleAlert, "bg-drk-500 text-white border-drk-500"],
                  ["NOT_APPLICABLE", "Nicht zutreffend", Minus, "bg-gray-600 text-white border-gray-600"],
                ] as const).map(([value, label, Icon, activeCls]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={r.result === value}
                    onClick={() => set(item.id, { result: value })}
                    className={clsx("flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-1 text-xs font-bold sm:flex-row sm:gap-2 sm:text-sm", r.result === value ? activeCls : "border-gray-200 bg-white text-gray-700")}
                  >
                    <Icon className="h-5 w-5" aria-hidden /> {label}
                  </button>
                ))}
              </div>
              {(r.result === "DEFECT" || r.note) && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="label" htmlFor={`note-${item.id}`}>Bemerkung{r.result === "DEFECT" && <span className="text-drk-600"> *</span>}</label>
                    <textarea id={`note-${item.id}`} className="input" rows={2} value={r.note ?? ""} onChange={(e) => set(item.id, { note: e.target.value })} aria-invalid={Boolean(noteErr)} />
                    {noteErr && <p className="mt-1 text-sm text-drk-700">{noteErr}</p>}
                  </div>
                  {r.result === "DEFECT" && (
                    <div className="rounded-lg border border-drk-200 bg-white p-3">
                      <label className="flex min-h-11 items-center gap-3 font-semibold">
                        <input type="checkbox" className="h-6 w-6 accent-drk-500" checked={Boolean(r.createDefect)} onChange={(e) => set(item.id, { createDefect: e.target.checked })} />
                        Direkt als Mangel melden
                      </label>
                      {r.createDefect && (
                        <div className="mt-2 grid gap-3 sm:grid-cols-3">
                          <div className="sm:col-span-3">
                            <label className="label" htmlFor={`t-${item.id}`}>Titel des Mangels</label>
                            <input id={`t-${item.id}`} className="input" value={r.title ?? item.label} onChange={(e) => set(item.id, { title: e.target.value })} />
                          </div>
                          <div>
                            <label className="label" htmlFor={`s-${item.id}`}>Schweregrad</label>
                            <select id={`s-${item.id}`} className="input" value={r.severity ?? "MEDIUM"} onChange={(e) => set(item.id, { severity: e.target.value })}>
                              {Object.entries(DEFECT_SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="label" htmlFor={`c-${item.id}`}>Kategorie</label>
                            <select id={`c-${item.id}`} className="input" value={r.category ?? "OTHER"} onChange={(e) => set(item.id, { category: e.target.value })}>
                              {Object.entries(DEFECT_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                          {r.severity === "CRITICAL" && <Alert tone="error" className="sm:col-span-3" title="Kritischer Mangel: Bitte umgehend die verantwortliche Person informieren. Die Einsatzfähigkeit ist ggf. nicht gegeben." />}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {r.result && r.result !== "DEFECT" && !r.note && (
                <button type="button" className="mt-2 text-sm font-medium text-gray-600 underline" onClick={() => set(item.id, { note: " " })}>
                  Bemerkung hinzufügen
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <CheckMaterials
        stocks={materials.stocks}
        state={matState}
        onChange={setMatState}
        errors={error?.fields}
        today={materials.today}
        warnDays={materials.warnDays}
        hiddenNarcotics={materials.hiddenNarcotics}
        vehicleId={vehicle.id}
      />

      <div className="card space-y-4 p-4">
        <div>
          <label className="label" htmlFor="remarks">Bemerkungen zur Kontrolle</label>
          <textarea id="remarks" className="input" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <LocalFilePicker files={files} onChange={setFiles} />
      </div>

      {error && <Alert tone="error" title={error.message} />}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={submit} disabled={busy} className="sm:min-w-64">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Kontrolle abschließen
        </Button>
        {!online && (
          <p className="flex items-center gap-2 text-sm text-gray-600"><CloudOff className="h-4 w-4" /> Offline – wird lokal gespeichert und später übertragen.</p>
        )}
      </div>
      <p className="text-xs text-gray-500">Nach dem Abschluss ist die Kontrolle revisionssicher gespeichert und kann nicht mehr verändert werden. Ergänzungen sind nur als protokollierter Nachtrag möglich.</p>
    </div>
  );
}
