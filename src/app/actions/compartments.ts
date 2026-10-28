"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { formObject, runAction } from "@/server/action";
import { copyLoadout, createCompartment, deleteCompartment, updateCompartment } from "@/server/services/compartments";

const base = (vehicleId: string) => `/fahrzeuge/${vehicleId}/material`;

export async function createCompartmentAction(vehicleId: string, parentId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const c = await createCompartment(actor, vehicleId, { ...formObject(fd), parentId: parentId ?? "" });
    revalidatePath(base(vehicleId));
    return { message: `„${c.name}“ angelegt.` };
  });
}

export async function updateCompartmentAction(id: string, vehicleId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await updateCompartment(actor, id, formObject(fd));
    revalidatePath(base(vehicleId));
    return { message: "Gespeichert." };
  });
}

export async function deleteCompartmentAction(id: string, vehicleId: string): Promise<ActionState> {
  let parentId: string | null = null;
  const res = await runAction(async (actor) => {
    parentId = (await deleteCompartment(actor, id)).parentId;
  });
  if (res.ok) redirect(parentId ? `${base(vehicleId)}?ort=${parentId}` : base(vehicleId));
  return res;
}

export async function copyLoadoutAction(vehicleId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const r = await copyLoadout(actor, String(fd.get("fromVehicleId") ?? ""), vehicleId);
    revalidatePath(base(vehicleId));
    return {
      message: `Übernommen: ${r.compartments} Schränke/Fächer, ${r.positions} Materialpositionen (Bestand 0 – beim ersten Check die tatsächlichen Mengen erfassen).${r.skippedNarcotics ? ` ${r.skippedNarcotics} BtM-Position(en) ohne BtM-Recht nicht übernommen.` : ""}`,
    };
  });
}
