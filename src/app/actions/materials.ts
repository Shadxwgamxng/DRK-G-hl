"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { formIds, formObject, runAction } from "@/server/action";
import { correctVehicleStock, createMaterial, createVehicleStock, deactivateVehicleStock, markStockChecked, updateMaterial, updateVehicleStock, upsertCategory } from "@/server/services/materials";

export async function createStockAction(vehicleId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const o = formObject(fd);
  let id = "";
  const res = await runAction(async (actor) => {
    const initial = o.initialBatchExpiry
      ? { batches: [{ batchNumber: o.initialBatchNumber || undefined, expiryDate: new Date(o.initialBatchExpiry), quantity: Number(o.initialQuantity) || 0 }] }
      : { quantity: Number(o.initialQuantity) || 0 };
    if (initial.quantity !== undefined && (!Number.isInteger(initial.quantity) || initial.quantity < 0)) return { ok: false, fieldErrors: { initialQuantity: "Ganze Zahl ≥ 0" }, message: "Bitte Eingaben prüfen." };
    id = (await createVehicleStock(actor, vehicleId, o, initial)).id;
  });
  // im Schrank/Fach angelegt → dort bleiben, sonst zur neuen Position
  if (res.ok && id) redirect(o.compartmentId ? `/fahrzeuge/${vehicleId}/material?ort=${o.compartmentId}` : `/fahrzeuge/${vehicleId}/material/${id}?neu=1`);
  return res;
}

export async function updateStockAction(stockId: string, path: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await updateVehicleStock(actor, stockId, formObject(fd));
    revalidatePath(path);
    return { message: "Materialposition gespeichert." };
  });
}

export async function deactivateStockAction(stockId: string, vehicleId: string): Promise<ActionState> {
  const res = await runAction((actor) => deactivateVehicleStock(actor, stockId));
  if (res.ok) redirect(`/fahrzeuge/${vehicleId}/material`);
  return res;
}

export async function correctStockAction(path: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const { delta } = await correctVehicleStock(actor, formObject(fd));
    revalidatePath(path);
    return { message: delta === 0 ? "Bestand stimmt – als geprüft markiert." : `Bestand korrigiert (${delta > 0 ? "+" : ""}${delta}).` };
  });
}

export async function markCheckedAction(vehicleId: string, stockIds: string[] | undefined): Promise<ActionState> {
  return runAction(async (actor) => {
    const n = await markStockChecked(actor, vehicleId, stockIds);
    revalidatePath(`/fahrzeuge/${vehicleId}/material`);
    return { message: `${n} Position(en) als geprüft markiert.` };
  });
}

export async function upsertMaterialAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const img = formIds(fd, "imageId")[0];
    if (id) await updateMaterial(actor, id, formObject(fd), img);
    else await createMaterial(actor, formObject(fd), img);
    revalidatePath("/material");
    return { message: id ? "Material gespeichert." : "Material angelegt." };
  });
}

export async function upsertCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await upsertCategory(actor, formObject(fd));
    revalidatePath("/admin/einstellungen");
    return { message: "Kategorie gespeichert." };
  });
}
