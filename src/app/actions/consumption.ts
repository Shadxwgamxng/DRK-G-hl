"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { errorState, runAction } from "@/server/action";
import { clientIp } from "@/server/auth/current";
import { consumptionLink, submitPublicConsumption } from "@/server/services/consumption";

export type ConsumptionResult = ActionState & { done?: { vehicle: string; lines: { material: string; unit: string; reported: number }[] } };

/** Öffentlich (ohne Login) – Zugriff nur über den geheimen Fahrzeug-Link. */
export async function submitConsumptionAction(token: string, _: ConsumptionResult, fd: FormData): Promise<ConsumptionResult> {
  try {
    const items = [...fd.entries()]
      .filter(([k, v]) => k.startsWith("qty_") && Number(v) > 0)
      .map(([k, v]) => ({ stockId: k.slice(4), quantity: Number(v) }));
    const res = await submitPublicConsumption(
      token,
      { occasion: fd.get("occasion"), occurredOn: fd.get("occurredOn"), reporterName: fd.get("reporterName"), note: fd.get("note"), website: fd.get("website") ?? "", items },
      await clientIp(),
    );
    return { ok: true, ts: Date.now(), message: "Danke!", done: { vehicle: res.vehicleName, lines: res.lines.map((l) => ({ material: l.material, unit: l.unit, reported: l.reported })) } };
  } catch (e) {
    return errorState(e);
  }
}

export async function renewConsumptionLinkAction(vehicleId: string): Promise<ActionState> {
  return runAction(async (actor) => {
    await consumptionLink(actor, vehicleId, true);
    revalidatePath(`/fahrzeuge/${vehicleId}/qr`);
    return { message: "Neuer QR-Code erzeugt – der alte ist ab sofort ungültig." };
  });
}
