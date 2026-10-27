import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Private Dateiablage im lokalen Dateisystem (außerhalb des Webroots).
 * Die Schnittstelle ist bewusst schmal gehalten, damit später ein S3-kompatibler Speicher
 * (z. B. MinIO) ohne Änderungen an der Geschäftslogik eingesetzt werden kann.
 */
function baseDir() {
  return path.resolve(process.env.UPLOAD_DIR || "./storage/uploads");
}

function resolveKey(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Ungültiger Speicherschlüssel");
  return path.join(baseDir(), key.slice(0, 2), key);
}

export async function saveFile(data: Buffer): Promise<string> {
  const key = randomUUID();
  const p = resolveKey(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data, { mode: 0o600 });
  return key;
}

export async function readStoredFile(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function deleteStoredFile(key: string) {
  await unlink(resolveKey(key)).catch(() => undefined);
}

export const ALLOWED_TYPES: Record<string, { kind: "PHOTO" | "DOCUMENT"; ext: string }> = {
  "image/jpeg": { kind: "PHOTO", ext: "jpg" },
  "image/png": { kind: "PHOTO", ext: "png" },
  "image/webp": { kind: "PHOTO", ext: "webp" },
  "image/heic": { kind: "PHOTO", ext: "heic" },
  "application/pdf": { kind: "DOCUMENT", ext: "pdf" },
};

/** Ermittelt den Dateityp anhand der Dateisignatur (Magic Bytes) statt des Client-Headers. */
export function sniffMimeType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "mif1", "msf1", "heim", "heis"].includes(brand)) return "image/heic";
  }
  return null;
}

export function maxUploadBytes() {
  return (Number(process.env.UPLOAD_MAX_MB) || 15) * 1024 * 1024;
}
