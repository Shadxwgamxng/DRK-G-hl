"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { formObject, runAction } from "@/server/action";
import { cancelRefill, closeRefill, confirmRefill, provideRefill, startRefill } from "@/server/services/refills";

const done = (message: string) => {
  revalidatePath("/nachfuellung");
  return { message };
};

export async function startRefillAction(id: string): Promise<ActionState> {
  return runAction(async (actor) => (await startRefill(actor, id), done("Übernommen.")));
}

export async function provideRefillAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  // Felder: qty_<warehouseStockId>[__<batchId>]
  const items: { warehouseStockId: string; batchId?: string; quantity: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("qty_") || typeof v !== "string" || !v.trim()) continue;
    const q = Number(v);
    if (!q) continue;
    const [ws, batch] = k.slice(4).split("__");
    items.push({ warehouseStockId: ws, batchId: batch || undefined, quantity: q });
  }
  return runAction(async (actor) => (await provideRefill(actor, id, { items, note: formObject(fd).note }), done("Material bereitgestellt.")));
}

export async function confirmRefillAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const o = formObject(fd);
  const batches = o.batchExpiry ? [{ batchNumber: o.batchNumber, expiryDate: o.batchExpiry, quantity: o.quantity }] : undefined;
  return runAction(async (actor) => {
    const { followUp } = await confirmRefill(actor, id, { quantity: o.quantity, note: o.note, batches });
    return done(followUp ? `Nachfüllung gebucht. Restbedarf von ${followUp.requestedQuantity} wurde als neue Anforderung angelegt.` : "Nachfüllung gebucht – Bestand aktualisiert.");
  });
}

export async function closeRefillAction(id: string): Promise<ActionState> {
  return runAction(async (actor) => (await closeRefill(actor, id), done("Erledigt.")));
}

export async function cancelRefillAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async (actor) => (await cancelRefill(actor, id, formObject(fd).reason), done("Storniert.")));
}
