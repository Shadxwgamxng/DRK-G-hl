import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import type { Actor } from "./actor";
import { getCurrentActor } from "./auth/current";
import { isAppError } from "./errors";

/** Einheitliche Fehlerbehandlung für Server Actions. Die Berechtigungsprüfung erfolgt in den Services. */
export async function runAction(fn: (actor: Actor) => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const actor = await getCurrentActor();
    if (!actor || actor.status !== "ACTIVE") return { ok: false, message: "Sitzung abgelaufen oder Konto nicht freigegeben. Bitte erneut anmelden." };
    const res = await fn(actor);
    return { ok: true, message: "Gespeichert.", ts: Date.now(), ...(res ?? {}) };
  } catch (e) {
    unstable_rethrow(e);
    return errorState(e);
  }
}

export function errorState(e: unknown): ActionState {
  if (isAppError(e)) return { ok: false, message: e.message, fieldErrors: e.fieldErrors, ts: Date.now() };
  console.error(e);
  return { ok: false, message: "Unerwarteter Fehler. Bitte erneut versuchen oder die Administration informieren.", ts: Date.now() };
}

export function formObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !(k in o) && !k.startsWith("$ACTION")) o[k] = v;
  return o;
}

export function formIds(fd: FormData, name = "attachmentIds"): string[] {
  return fd.getAll(name).filter((v): v is string => typeof v === "string" && v.length > 0);
}
