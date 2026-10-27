"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, PackageMinus } from "lucide-react";
import { newClientRef, saveDraft, submitDraft, type Draft } from "@/lib/offline-store";
import { MOVEMENT_REASON } from "@/lib/labels";
import { fmtDate } from "@/lib/format";
import { LocalFilePicker } from "./Uploader";
import { Alert, Button } from "./ui";

type Batch = { id: string; batchNumber: string | null; expiryDate: string | null; quantity: number };

/** Material austragen – abgelaufen, verbraucht, beschädigt, verloren … (online sofort, offline als Entwurf). */
export function WriteOffForm({ userId, vehicleId, stock, title }: { userId: string; vehicleId: string; title: string; stock: { id: string; unit: string; batchTracked: boolean; currentQuantity: number; batches: Batch[] } }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const firstExpired = stock.batches.find((b) => b.expiryDate && b.expiryDate.slice(0, 10) < today);
  const [reason, setReason] = useState<string>(firstExpired ? "EXPIRED" : "USED");
  const [batchId, setBatchId] = useState(firstExpired?.id ?? stock.batches[0]?.id ?? "");
  const batch = stock.batches.find((b) => b.id === batchId);
  const [quantity, setQuantity] = useState(String(firstExpired?.quantity ?? 1));
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "warning"; text: string; fields?: Record<string, string> } | null>(null);

  const max = stock.batchTracked ? (batch?.quantity ?? 0) : stock.currentQuantity;

  async function submit() {
    setMsg(null);
    setBusy(true);
    const draft: Draft = {
      id: newClientRef(),
      kind: "writeoff",
      userId,
      vehicleId,
      title: `${title}: ${quantity} ${stock.unit} (${MOVEMENT_REASON[reason]})`,
      payload: { stockId: stock.id, quantity, reason, batchId: stock.batchTracked ? batchId : undefined, batchNumber: stock.batchTracked ? undefined : batchNumber, expiryDate: stock.batchTracked ? undefined : expiryDate, occurredAt: date, note },
      files: files.map((f) => ({ name: f.name, type: f.type, blob: f })),
      createdAt: new Date().toISOString(),
      status: "pending",
      attempts: 0,
    };
    const res = navigator.onLine ? await submitDraft(draft) : ({ ok: false, offline: true } as const);
    setBusy(false);
    if (res.ok) {
      setMsg({ tone: "success", text: "Material ausgetragen. Bestand und Nachfüllliste wurden aktualisiert." });
      setNote("");
      setFiles([]);
      router.refresh();
    } else if (res.offline) {
      await saveDraft(draft);
      setMsg({ tone: "warning", text: "Offline: Austragung lokal gespeichert. Sie wird bei Verbindung übertragen und dann gegen den aktuellen Bestand geprüft." });
    } else {
      setMsg({ tone: "error", text: res.message, fields: res.fieldErrors });
    }
  }

  if (max === 0 && !stock.batchTracked) return <p className="text-sm text-gray-600">Kein Bestand vorhanden – nichts auszutragen.</p>;

  return (
    <div className="space-y-4">
      <div>
        <p className="label">Grund</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Object.entries(MOVEMENT_REASON).map(([k, v]) => (
            <button key={k} type="button" onClick={() => setReason(k)} aria-pressed={reason === k} className={clsx("min-h-12 rounded-lg border-2 px-2 text-sm font-semibold", reason === k ? "border-drk-500 bg-drk-500 text-white" : "border-gray-200 bg-white")}>
              {v}
            </button>
          ))}
        </div>
      </div>
      {stock.batchTracked ? (
        <div>
          <label className="label" htmlFor="wo-batch">Betroffene Charge *</label>
          {stock.batches.length === 0 ? (
            <p className="text-sm text-gray-600">Keine Charge mit Bestand vorhanden.</p>
          ) : (
            <select id="wo-batch" className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)} aria-invalid={Boolean(msg?.fields?.batchId)}>
              {stock.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  Charge {b.batchNumber ?? "o. Nr."} · Verfall {fmtDate(b.expiryDate)} · {b.quantity} {stock.unit}
                  {b.expiryDate && b.expiryDate.slice(0, 10) < today ? " · ABGELAUFEN" : ""}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-gray-500">Nur die gewählte Charge wird belastet – andere Chargen desselben Artikels bleiben unverändert.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="wo-bn">Chargennummer (falls relevant)</label>
            <input id="wo-bn" className="input" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="wo-exp">Verfallsdatum (falls relevant)</label>
            <input id="wo-exp" type="date" className="input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="wo-qty">Menge ({stock.unit}) *</label>
          <input id="wo-qty" type="number" inputMode="numeric" min={1} max={max} className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={Boolean(msg?.fields?.quantity)} />
          <p className="mt-1 text-xs text-gray-500">{msg?.fields?.quantity ?? `Verfügbar: ${max} ${stock.unit}`}</p>
        </div>
        <div>
          <label className="label" htmlFor="wo-date">Datum *</label>
          <input id="wo-date" type="date" max={today} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="wo-note">Bemerkung{reason === "OTHER" && <span className="text-drk-600"> *</span>}</label>
        <textarea id="wo-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(msg?.fields?.note)} />
      </div>
      <LocalFilePicker files={files} onChange={setFiles} />
      {msg && <Alert tone={msg.tone} title={msg.text} />}
      <Button size="lg" variant="primary" onClick={submit} disabled={busy || (stock.batchTracked && !batchId)}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageMinus className="h-5 w-5" />} Material austragen
      </Button>
    </div>
  );
}
