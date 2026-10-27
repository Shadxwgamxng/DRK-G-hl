"use client";

/**
 * Lokaler Entwurfsspeicher (IndexedDB) für Offline-Erfassung.
 * Es werden nur Entwürfe und vom Benutzer ausgewählte Fotos gespeichert – keine Stammdatenkopie.
 * Beim Abmelden wird der Speicher geleert (Schutz auf gemeinsam genutzten Geräten).
 */

export type DraftKind = "check" | "defect" | "writeoff";
export type DraftStatus = "pending" | "syncing" | "error" | "conflict";

export type DraftFile = { name: string; type: string; blob: Blob; uploadedId?: string };

export type Draft = {
  id: string; // = clientRef (UUID), Idempotenzschlüssel für den Server
  kind: DraftKind;
  userId: string;
  vehicleId: string;
  title: string; // Anzeige in der Synchronisationsliste
  payload: Record<string, unknown>;
  files: DraftFile[];
  createdAt: string;
  status: DraftStatus;
  message?: string;
  attempts: number;
};

const DB_NAME = "drk-kfz-warte";
const STORE = "drafts";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const saveDraft = (d: Draft) => tx("readwrite", (s) => s.put(d)).then(() => notifyChange());
export const deleteDraft = (id: string) => tx("readwrite", (s) => s.delete(id)).then(() => notifyChange());
export const listDrafts = async (userId?: string) => {
  const all = (await tx<Draft[]>("readonly", (s) => s.getAll())) ?? [];
  return all.filter((d) => !userId || d.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};
export const clearDrafts = () => tx("readwrite", (s) => s.clear()).then(() => notifyChange());

export function notifyChange() {
  window.dispatchEvent(new Event("drk-drafts-changed"));
}

export function newClientRef() {
  return crypto.randomUUID();
}

/** Upload einer Datei mit Fortschrittsanzeige (XHR, da fetch keinen Upload-Fortschritt liefert). */
export function uploadFile(file: Blob, name: string, onProgress?: (p: number) => void): Promise<{ id: string; originalName: string; mimeType: string; kind: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { ok?: boolean; message?: string; attachment?: { id: string; originalName: string; mimeType: string; kind: string } } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.attachment) resolve(body.attachment);
      else reject(new UploadError(body.message ?? `Upload fehlgeschlagen (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => reject(new UploadError("Keine Verbindung zum Server.", 0));
    const fd = new FormData();
    fd.append("file", file, name);
    xhr.send(fd);
  });
}

export class UploadError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Fotos vor dem Upload verkleinern (spart mobiles Datenvolumen). HEIC/PDF bleiben unverändert. */
export async function compressImage(file: File, maxSide = 2000, quality = 0.85): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

const SYNC_URL: Record<DraftKind, string> = { check: "/api/sync/check", defect: "/api/sync/defect", writeoff: "/api/sync/writeoff" };

export type SubmitResult = { ok: true; id: string; duplicate?: boolean; data?: Record<string, unknown> } | { ok: false; offline: true } | { ok: false; offline: false; code?: string; message: string; fieldErrors?: Record<string, string> };

/** Sendet einen Entwurf an den Server (lädt zuerst noch nicht hochgeladene Dateien hoch). */
export async function submitDraft(d: Draft, onProgress?: (msg: string) => void): Promise<SubmitResult> {
  const ids: string[] = [];
  for (const [i, f] of d.files.entries()) {
    if (f.uploadedId) {
      ids.push(f.uploadedId);
      continue;
    }
    try {
      onProgress?.(`Foto ${i + 1}/${d.files.length} wird hochgeladen …`);
      const att = await uploadFile(f.blob, f.name);
      f.uploadedId = att.id;
      ids.push(att.id);
    } catch (e) {
      if (e instanceof UploadError && e.status === 0) return { ok: false, offline: true };
      return { ok: false, offline: false, message: (e as Error).message };
    }
  }
  try {
    const res = await fetch(SYNC_URL[d.kind], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: d.vehicleId, payload: { ...d.payload, clientRef: d.id }, attachmentIds: ids }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) return { ok: true, id: body.id, duplicate: body.duplicate, data: body };
    return { ok: false, offline: false, code: body.code, message: body.message ?? `Fehler ${res.status}`, fieldErrors: body.fieldErrors };
  } catch {
    return { ok: false, offline: true };
  }
}
