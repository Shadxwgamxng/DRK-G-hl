"use client";

import { useRef, useState } from "react";
import { Camera, FileText, ImagePlus, Loader2, X } from "lucide-react";
import { compressImage, uploadFile } from "@/lib/offline-store";
import { buttonClass } from "./ui";

type Item = { key: string; name: string; progress: number; id?: string; error?: string; preview?: string; isPdf: boolean };

/**
 * Upload-Feld mit Kamera, Galerie, Vorschau und Fortschritt.
 * Hochgeladene Dateien werden als versteckte Felder `name` an das umgebende Formular übergeben.
 */
export function Uploader({ name = "attachmentIds", label = "Fotos / Dokumente", accept = "image/*,application/pdf", allowPdf = true, single = false }: { name?: string; label?: string; accept?: string; allowPdf?: boolean; single?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  async function handle(files: FileList | null) {
    if (!files) return;
    const list = single ? [files[0]] : Array.from(files);
    for (const file of list) {
      const key = crypto.randomUUID();
      const isPdf = file.type === "application/pdf";
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setItems((prev) => [...(single ? [] : prev), { key, name: file.name, progress: 0, preview, isPdf }]);
      try {
        const blob = await compressImage(file);
        const att = await uploadFile(blob, file.name, (p) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, progress: p } : i))));
        setItems((prev) => prev.map((i) => (i.key === key ? { ...i, id: att.id, progress: 100 } : i)));
      } catch (e) {
        setItems((prev) => prev.map((i) => (i.key === key ? { ...i, error: (e as Error).message } : i)));
      }
    }
  }

  const busy = items.some((i) => !i.id && !i.error);
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => camRef.current?.click()} className={buttonClass("secondary")}>
          <Camera className="h-5 w-5" aria-hidden /> Foto aufnehmen
        </button>
        <button type="button" onClick={() => galRef.current?.click()} className={buttonClass("secondary")}>
          <ImagePlus className="h-5 w-5" aria-hidden /> {allowPdf ? "Datei / Galerie" : "Aus Galerie"}
        </button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => (handle(e.target.files), (e.target.value = ""))} />
      <input ref={galRef} type="file" accept={allowPdf ? accept : "image/*"} multiple={!single} className="sr-only" tabIndex={-1} onChange={(e) => (handle(e.target.files), (e.target.value = ""))} />
      {items.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((i) => (
            <li key={i.key} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              {i.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.preview} alt={i.name} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-gray-500">
                  <FileText className="h-10 w-10" aria-hidden />
                </div>
              )}
              <div className="p-1.5 text-xs">
                <p className="truncate font-medium">{i.name}</p>
                {i.error ? (
                  <p className="text-drk-700">{i.error}</p>
                ) : i.id ? (
                  <p className="text-green-700">Hochgeladen</p>
                ) : (
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-gray-200" role="progressbar" aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-drk-500 transition-all" style={{ width: `${i.progress}%` }} />
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setItems((p) => p.filter((x) => x.key !== i.key))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1.5 shadow" aria-label={`${i.name} entfernen`}>
                <X className="h-4 w-4" />
              </button>
              {i.id && <input type="hidden" name={name} value={i.id} />}
            </li>
          ))}
        </ul>
      )}
      {busy && (
        <p className="mt-2 flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Upload läuft – bitte mit dem Speichern warten.
        </p>
      )}
    </div>
  );
}

/** Lokale Dateiauswahl für Offline-Entwürfe (Dateien werden erst bei der Synchronisation hochgeladen). */
export function LocalFilePicker({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => list && onChange([...files, ...Array.from(list)]);
  return (
    <div>
      <p className="label">Fotos / Dokumente</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => camRef.current?.click()} className={buttonClass("secondary")}>
          <Camera className="h-5 w-5" aria-hidden /> Foto aufnehmen
        </button>
        <button type="button" onClick={() => galRef.current?.click()} className={buttonClass("secondary")}>
          <ImagePlus className="h-5 w-5" aria-hidden /> Datei / Galerie
        </button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      <input ref={galRef} type="file" accept="image/*,application/pdf" multiple className="sr-only" tabIndex={-1} onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {files.map((f, idx) => (
            <li key={idx} className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              {f.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={URL.createObjectURL(f)} alt={f.name} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-gray-500">
                  <FileText className="h-10 w-10" aria-hidden />
                </div>
              )}
              <p className="truncate p-1.5 text-xs font-medium">{f.name}</p>
              <button type="button" onClick={() => onChange(files.filter((_, i) => i !== idx))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1.5 shadow" aria-label={`${f.name} entfernen`}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AttachmentGallery({ items }: { items: { id: string; originalName: string; mimeType: string; createdAt?: Date }[] }) {
  if (items.length === 0) return <p className="text-sm text-gray-500">Keine Anhänge vorhanden.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((a) => (
        <li key={a.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <a href={`/api/files/${a.id}`} target="_blank" rel="noopener" className="block">
            {a.mimeType.startsWith("image/") && a.mimeType !== "image/heic" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${a.id}`} alt={a.originalName} loading="lazy" className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-gray-50 text-gray-500">
                <FileText className="h-10 w-10" aria-hidden />
              </div>
            )}
            <p className="truncate p-1.5 text-xs font-medium text-gray-700">{a.originalName}</p>
          </a>
        </li>
      ))}
    </ul>
  );
}
