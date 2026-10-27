"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { formObject, runAction } from "@/server/action";
import { receiveStock, setWarehouseMin, upsertLocation, upsertWarehouse, warehouseMovement } from "@/server/services/warehouse";

export async function receiveStockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await receiveStock(actor, formObject(fd));
    revalidatePath("/lager");
    return { message: "Zugang gebucht." };
  });
}

export async function warehouseMovementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    const m = await warehouseMovement(actor, formObject(fd));
    revalidatePath("/lager");
    return { message: m ? "Buchung gespeichert." : "Keine Abweichung – nichts gebucht." };
  });
}

export async function setWarehouseMinAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await setWarehouseMin(actor, id, Number(formObject(fd).minQuantity));
    revalidatePath("/lager");
    return { message: "Mindestbestand gespeichert." };
  });
}

export async function upsertWarehouseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await upsertWarehouse(actor, formObject(fd));
    revalidatePath("/lager/orte");
    return { message: "Lager gespeichert." };
  });
}

export async function upsertLocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => {
    await upsertLocation(actor, formObject(fd));
    revalidatePath("/lager/orte");
    return { message: "Lagerort gespeichert." };
  });
}
