import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import type { Actor } from "@/server/actor";
import { loadActor } from "@/server/auth/session";

export { db };

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function makeUser(roleKey: "ADMIN" | "FLEET_MANAGER" | "USER" | "WAREHOUSE", opts: { status?: "ACTIVE" | "PENDING"; canPerformChecks?: boolean; allowMultipleVehicles?: boolean } = {}) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  const id = uid();
  const u = await db.user.create({
    data: {
      firstName: "Test",
      lastName: roleKey,
      username: `u_${id}`,
      email: `${id}@test.local`,
      passwordHash: "x",
      roleId: role.id,
      status: opts.status ?? "ACTIVE",
      canPerformChecks: opts.canPerformChecks ?? false,
      allowMultipleVehicles: opts.allowMultipleVehicles ?? false,
      termsAcceptedAt: new Date(),
    },
  });
  return (await loadActor(u.id))!;
}

export async function makeVehicle(name = "RTW") {
  const type = await db.vehicleType.findFirstOrThrow({ where: { name: "RTW" } });
  const id = uid();
  return db.vehicle.create({ data: { name: `${name} ${id}`, internalNumber: `N-${id}`, licensePlate: `PL-${id}`.toUpperCase(), typeId: type.id } });
}

export async function assign(actor: Actor, vehicleId: string) {
  await db.vehicleAssignment.create({ data: { userId: actor.id, vehicleId } });
}

export async function makeMaterial(opts: { batchTracked?: boolean; name?: string } = {}) {
  const cat = await db.materialCategory.findFirstOrThrow({ where: { isMedication: false } });
  return db.material.create({ data: { name: `${opts.name ?? "Infusionslösung"} ${uid()}`, categoryId: cat.id, unit: "Stück", batchTracked: opts.batchTracked ?? false } });
}

export async function refreshActor(a: Actor) {
  return (await loadActor(a.id))!;
}

export const newRef = () => randomUUID();
