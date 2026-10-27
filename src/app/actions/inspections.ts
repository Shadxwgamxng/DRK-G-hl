"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { formIds, formObject, runAction } from "@/server/action";
import { completeInspection, createInspection, deactivateInspection, updateInspection, upsertInspectionType } from "@/server/services/inspections";

function withReminders(fd: FormData) {
  const o: Record<string, unknown> = formObject(fd);
  o.reminderDays = fd.getAll("reminderDays").map(String).join(",") || String(o.reminderDaysText ?? "");
  return o;
}

export async function createInspectionAction(vehicleId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async (actor) => {
    id = (await createInspection(actor, vehicleId, withReminders(fd), formIds(fd))).id;
  });
  if (res.ok) redirect(`/termine/${id}`);
  return res;
}

export async function updateInspectionAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await updateInspection(actor, id, withReminders(fd), formIds(fd));
    revalidatePath(`/termine/${id}`);
    return { message: "Termin gespeichert." };
  });
}

export async function completeInspectionAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await completeInspection(actor, id, formObject(fd), formIds(fd));
    revalidatePath(`/termine/${id}`);
    return { message: "Durchführung dokumentiert. Nächster Termin wurde berechnet." };
  });
}

export async function deactivateInspectionAction(id: string): Promise<ActionState> {
  return runAction(async (actor) => {
    await deactivateInspection(actor, id);
    revalidatePath(`/termine/${id}`);
    return { message: "Termin deaktiviert." };
  });
}

export async function upsertInspectionTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await upsertInspectionType(actor, { ...formObject(fd), archived: fd.get("archived") === "on" });
    revalidatePath("/admin/einstellungen");
    return { message: "Prüfungsart gespeichert." };
  });
}
