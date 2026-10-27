"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, Loader2, Send } from "lucide-react";
import { deleteDraft, listDrafts, newClientRef, saveDraft, submitDraft, type Draft } from "@/lib/offline-store";
import { DEFECT_CATEGORY, DEFECT_SEVERITY } from "@/lib/labels";
import { LocalFilePicker } from "./Uploader";
import { Alert, Button } from "./ui";

type Vehicle = { id: string; name: string; licensePlate: string; mileage: number | null };

export function DefectForm({ userId, vehicles, defaultVehicleId, draftId, canAssign, users }: { userId: string; vehicles: Vehicle[]; defaultVehicleId?: string; draftId?: string; canAssign: boolean; users: { id: string; firstName: string; lastName: string }[] }) {
  const router = useRouter();
  const [ref, setRef] = useState(() => draftId ?? newClientRef());
  const [f, setF] = useState<Record<string, string>>({ vehicleId: defaultVehicleId ?? (vehicles.length === 1 ? vehicles[0].id : ""), category: "", severity: "", title: "", description: "", mileage: "", assignedToId: "", dueDate: "", affectsReadiness: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!draftId) return;
    listDrafts(userId).then((all) => {
      const d = all.find((x) => x.id === draftId);
      if (!d) return;
      setF((p) => ({ ...p, ...(d.payload as Record<string, string>) }));
      setFiles(d.files.map((x) => new File([x.blob], x.name, { type: x.type })));
      setRef(d.id);
      if (d.message) setErr({ message: d.message });
    });
  }, [draftId, userId]);

  const vehicle = vehicles.find((v) => v.id === f.vehicleId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const fields: Record<string, string> = {};
    for (const k of ["vehicleId", "title", "description", "category", "severity"]) if (!f[k]?.trim()) fields[k] = "Pflichtfeld";
    if (Object.keys(fields).length) return setErr({ message: "Bitte die markierten Felder ausfüllen.", fields });
    setBusy(true);
    const draft: Draft = {
      id: ref,
      kind: "defect",
      userId,
      vehicleId: f.vehicleId,
      title: `${vehicle?.name ?? ""}: ${f.title}`,
      payload: { ...f, reportedAt: new Date().toISOString() },
      files: files.map((x) => ({ name: x.name, type: x.type, blob: x })),
      createdAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
    };
    const res = navigator.onLine ? await submitDraft(draft) : ({ ok: false, offline: true } as const);
    setBusy(false);
    if (res.ok) {
      if (draftId) await deleteDraft(draftId);
      const warn = (res.data as { readinessWarning?: boolean } | undefined)?.readinessWarning;
      router.push(`/maengel/${res.id}?neu=1${warn ? "&warnung=1" : ""}`);
      router.refresh();
    } else if (res.offline) {
      await saveDraft(draft);
      setOfflineSaved(true);
    } else {
      setErr({ message: res.message, fields: res.fieldErrors });
    }
  }

  if (offlineSaved)
    return (
      <Alert tone="warning" title="Offline gespeichert – noch nicht synchronisiert">
        Die Mängelmeldung wird automatisch übertragen, sobald wieder eine Verbindung besteht. <a className="font-semibold underline" href="/sync">Synchronisationsstatus</a>
        {f.severity === "CRITICAL" && <p className="mt-2 font-bold">Kritischer Mangel: Bitte die verantwortliche Person zusätzlich telefonisch informieren!</p>}
      </Alert>
    );

  const fe = err?.fields ?? {};
  const field = (k: string) => ({ "aria-invalid": Boolean(fe[k]), id: `df-${k}` });
  const Err = ({ k }: { k: string }) => (fe[k] ? <p className="mt-1 text-sm text-drk-700">{fe[k]}</p> : null);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {err && <Alert tone="error" title={err.message} />}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label" htmlFor="df-vehicleId">Betroffenes Fahrzeug *</label>
          <select className="input" value={f.vehicleId} onChange={(e) => set("vehicleId", e.target.value)} {...field("vehicleId")}>
            <option value="">Bitte wählen</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.licensePlate})</option>)}
          </select>
          <Err k="vehicleId" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="df-title">Titel des Mangels *</label>
          <input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="z. B. Blaulicht hinten links ohne Funktion" {...field("title")} />
          <Err k="title" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="df-description">Detaillierte Beschreibung *</label>
          <textarea className="input" rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} {...field("description")} />
          <Err k="description" />
        </div>
        <div>
          <label className="label" htmlFor="df-category">Kategorie *</label>
          <select className="input" value={f.category} onChange={(e) => set("category", e.target.value)} {...field("category")}>
            <option value="">Bitte wählen</option>
            {Object.entries(DEFECT_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <Err k="category" />
        </div>
        <div>
          <label className="label" htmlFor="df-severity">Schweregrad *</label>
          <select className="input" value={f.severity} onChange={(e) => set("severity", e.target.value)} {...field("severity")}>
            <option value="">Bitte wählen</option>
            {Object.entries(DEFECT_SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <Err k="severity" />
        </div>
        <div>
          <label className="label" htmlFor="df-mileage">Kilometerstand (optional)</label>
          <input className="input" type="number" inputMode="numeric" value={f.mileage} placeholder={vehicle?.mileage ? `zuletzt ${vehicle.mileage.toLocaleString("de-DE")}` : ""} onChange={(e) => set("mileage", e.target.value)} {...field("mileage")} />
          <Err k="mileage" />
        </div>
        {canAssign && (
          <>
            <div>
              <label className="label" htmlFor="df-assignedToId">Verantwortliche Person</label>
              <select className="input" value={f.assignedToId} onChange={(e) => set("assignedToId", e.target.value)} {...field("assignedToId")}>
                <option value="">– noch offen –</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.lastName}, {u.firstName}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="df-dueDate">Frist zur Behebung</label>
              <input className="input" type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} {...field("dueDate")} />
            </div>
          </>
        )}
      </div>
      <label className="flex min-h-12 items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <input type="checkbox" className="mt-0.5 h-6 w-6 accent-drk-500" checked={f.affectsReadiness === "on"} onChange={(e) => set("affectsReadiness", e.target.checked ? "on" : "")} />
        <span className="text-sm"><b>Sichere Einsatzfähigkeit fraglich</b><br />Die verantwortlichen Personen werden gewarnt und können den Fahrzeugstatus anpassen.</span>
      </label>
      {f.severity === "CRITICAL" && (
        <Alert tone="error" title="Kritischer Mangel">
          <span className="flex items-center gap-2"><AlertOctagon className="h-4 w-4" /> Die Meldung wird hervorgehoben und an alle Verantwortlichen gesendet. Bitte zusätzlich direkt informieren.</span>
        </Alert>
      )}
      <LocalFilePicker files={files} onChange={setFiles} />
      <Button size="lg" type="submit" disabled={busy}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />} Mangel melden
      </Button>
    </form>
  );
}
