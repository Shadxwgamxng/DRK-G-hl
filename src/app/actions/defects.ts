"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { formIds, formObject, runAction } from "@/server/action";
import { addDefectComment, changeDefectStatus, updateDefect } from "@/server/services/defects";

export async function updateDefectAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await updateDefect(actor, id, formObject(fd));
    revalidatePath(`/maengel/${id}`);
    return { message: "Mangel aktualisiert." };
  });
}

export async function changeDefectStatusAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const { vehicleNeedsRelease } = await changeDefectStatus(actor, id, formObject(fd));
    revalidatePath(`/maengel/${id}`);
    return {
      message: "Status geändert.",
      warning: vehicleNeedsRelease ? "Der Mangel ist abgeschlossen. Das Fahrzeug ist weiterhin NICHT als einsatzbereit freigegeben – die Freigabe muss eine berechtigte Person auf der Fahrzeugseite vornehmen." : undefined,
    };
  });
}

export async function addDefectCommentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await addDefectComment(actor, id, formObject(fd).text, formIds(fd));
    revalidatePath(`/maengel/${id}`);
    return { message: "Ergänzung gespeichert." };
  });
}
