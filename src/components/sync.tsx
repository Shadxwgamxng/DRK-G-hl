"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { deleteDraft, listDrafts, saveDraft, submitDraft, type Draft } from "@/lib/offline-store";
import { useOnline } from "./pwa";
import { Alert, Badge, Button, EmptyState } from "./ui";
import { fmtDateTime } from "@/lib/format";

let running = false;

/** Synchronisiert ausstehende Entwürfe des angemeldeten Benutzers. Konflikte werden NIE automatisch überschrieben. */
export async function syncAll(userId: string, onUpdate?: () => void) {
  if (running) return;
  running = true;
  try {
    const drafts = await listDrafts(userId);
    for (const d of drafts) {
      if (d.status === "conflict") continue; // erfordert Entscheidung des Benutzers
      d.status = "syncing";
      await saveDraft(d);
      onUpdate?.();
      const res = await submitDraft(d);
      if (res.ok) {
        await deleteDraft(d.id);
      } else if (res.offline) {
        d.status = "pending";
        await saveDraft(d);
        break; // weiterhin offline
      } else {
        d.status = res.code === "CONFLICT" || res.code === "VALIDATION" || res.code === "NOT_FOUND" || res.code === "FORBIDDEN" ? "conflict" : "error";
        d.message = res.message + (res.fieldErrors ? ` (${Object.values(res.fieldErrors).join(", ")})` : "");
        d.attempts += 1;
        await saveDraft(d);
      }
      onUpdate?.();
    }
  } finally {
    running = false;
  }
}

/** Läuft unsichtbar in der App-Shell: synchronisiert beim Start und sobald die Verbindung zurück ist. */
export function SyncRunner({ userId }: { userId: string }) {
  const online = useOnline();
  useEffect(() => {
    if (online) syncAll(userId).catch(() => undefined);
  }, [online, userId]);
  return null;
}

const KIND: Record<string, string> = { check: "Fahrzeugkontrolle", defect: "Mängelmeldung", writeoff: "Material austragen" };

export function SyncList({ userId }: { userId: string }) {
  const online = useOnline();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const load = useCallback(() => listDrafts(userId).then((d) => mounted.current && setDrafts(d)), [userId]);
  useEffect(() => {
    mounted.current = true;
    load();
    window.addEventListener("drk-drafts-changed", load);
    return () => {
      mounted.current = false;
      window.removeEventListener("drk-drafts-changed", load);
    };
  }, [load]);

  if (drafts === null) return <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Lade lokale Daten …</p>;

  return (
    <div className="space-y-4">
      {!online ? (
        <Alert tone="warning" title="Sie sind offline">Erfasste Kontrollen und Mängelmeldungen werden lokal gespeichert und automatisch übertragen, sobald wieder eine Verbindung besteht.</Alert>
      ) : (
        <Alert tone="success" title="Verbindung vorhanden" />
      )}
      {drafts.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-12 w-12 text-green-600" />} title="Alles synchronisiert">Auf diesem Gerät sind keine ausstehenden Vorgänge gespeichert.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!online || busy}
              onClick={async () => {
                setBusy(true);
                // fehlgeschlagene (nicht Konflikt-)Einträge erneut versuchen
                for (const d of drafts.filter((x) => x.status === "error")) await saveDraft({ ...d, status: "pending" });
                await syncAll(userId, load);
                setBusy(false);
              }}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />} Jetzt synchronisieren
            </Button>
          </div>
          <ul className="space-y-3">
            {drafts.map((d) => (
              <li key={d.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{KIND[d.kind]}: {d.title}</p>
                    <p className="text-xs text-gray-500">Offline erfasst am {fmtDateTime(d.createdAt)} · {d.files.length} Datei(en)</p>
                  </div>
                  {d.status === "pending" && <Badge tone="yellow" icon={<CloudOff className="h-3.5 w-3.5" />}>Nicht synchronisiert</Badge>}
                  {d.status === "syncing" && <Badge tone="blue" icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}>Wird übertragen</Badge>}
                  {d.status === "error" && <Badge tone="orange">Fehler – wird erneut versucht</Badge>}
                  {d.status === "conflict" && <Badge tone="red" icon={<AlertTriangle className="h-3.5 w-3.5" />}>Konflikt – Entscheidung nötig</Badge>}
                </div>
                {d.message && <p className="mt-2 rounded bg-drk-50 p-2 text-sm text-drk-800">{d.message}</p>}
                {d.status === "conflict" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {d.kind === "check" && <Link className="min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" href={`/fahrzeuge/${d.vehicleId}/kontrolle?entwurf=${d.id}`}>Entwurf öffnen & korrigieren</Link>}
                    {d.kind === "defect" && <Link className="min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" href={`/maengel/neu?entwurf=${d.id}`}>Entwurf öffnen & korrigieren</Link>}
                    <Button size="sm" variant="secondary" onClick={async () => { await saveDraft({ ...d, status: "pending", message: undefined }); await syncAll(userId, load); }}>Erneut senden</Button>
                  </div>
                )}
                <div className="mt-3">
                  <button
                    className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-drk-700 hover:bg-drk-50"
                    onClick={async () => {
                      if (window.confirm("Diesen lokalen Entwurf endgültig verwerfen? Er wurde nicht an den Server übertragen.")) await deleteDraft(d.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Verwerfen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
