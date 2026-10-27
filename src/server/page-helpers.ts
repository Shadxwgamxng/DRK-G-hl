import "server-only";
import { notFound } from "next/navigation";
import { isAppError } from "./errors";

/** Fremde oder nicht vorhandene Datensätze → 404 (keine Preisgabe der Existenz). */
export async function notFoundOnError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}

export function sp(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export function parseDate(v: string | undefined, end = false) {
  if (!v) return undefined;
  const d = new Date(`${v}T${end ? "23:59:59" : "00:00:00"}`);
  return isNaN(d.getTime()) ? undefined : d;
}
