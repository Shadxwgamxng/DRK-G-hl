"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { VehicleStatus } from "@prisma/client";
import type { ActionState } from "@/lib/action-state";
import { formIds, formObject, runAction } from "@/server/action";
import { addVehicleDocuments, archiveVehicle, createVehicle, setVehicleStatus, updateVehicle } from "@/server/services/vehicles";
import { deleteAttachment } from "@/server/services/attachments";
import { amendCheck } from "@/server/services/checks";

export async function createVehicleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async (actor) => {
    const v = await createVehicle(actor, formObject(fd), formIds(fd, "imageId")[0]);
    id = v.id;
  });
  if (res.ok) redirect(`/fahrzeuge/${id}?neu=1`);
  return res;
}

export async function updateVehicleAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction((actor) => updateVehicle(actor, id, formObject(fd), formIds(fd, "imageId")[0]));
  if (res.ok) redirect(`/fahrzeuge/${id}`);
  return res;
}

export async function setVehicleStatusAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const o = formObject(fd);
  return runAction(async (actor) => {
    await setVehicleStatus(actor, id, o.status as VehicleStatus, o.reason);
    revalidatePath(`/fahrzeuge/${id}`);
    return { message: "Einsatzstatus aktualisiert." };
  });
}

export async function archiveVehicleAction(id: string, archive: boolean): Promise<ActionState> {
  return runAction(async (actor) => {
    await archiveVehicle(actor, id, archive);
    revalidatePath(`/fahrzeuge/${id}`);
    revalidatePath("/fahrzeuge");
    return { message: archive ? "Fahrzeug archiviert." : "Fahrzeug reaktiviert." };
  });
}

export async function addVehicleDocumentsAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const ids = formIds(fd);
    if (!ids.length) return { ok: false, message: "Bitte zuerst eine Datei hochladen." };
    await addVehicleDocuments(actor, id, ids);
    revalidatePath(`/fahrzeuge/${id}`);
    return { message: "Dokumente gespeichert." };
  });
}

export async function deleteAttachmentAction(attachmentId: string, path: string): Promise<ActionState> {
  return runAction(async (actor) => {
    await deleteAttachment(actor, attachmentId);
    revalidatePath(path);
    return { message: "Anhang gelöscht." };
  });
}

export async function amendCheckAction(checkId: string, path: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await amendCheck(actor, checkId, formObject(fd).text);
    revalidatePath(path);
    return { message: "Nachtrag gespeichert." };
  });
}
