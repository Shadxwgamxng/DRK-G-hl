import type { Prisma } from "@prisma/client";
import type { Actor } from "./actor";
import { can } from "./actor";
import { db, type Tx } from "./db";
import { notFound } from "./errors";

/**
 * Zugriffsregel (serverseitig, auf Datenbankebene als WHERE-Bedingung umgesetzt):
 * - Inaktive Konten sehen nichts.
 * - Benutzer mit „vehicles.view_all“ (Administratoren) sehen alle Fahrzeuge.
 * - Alle anderen sehen ausschließlich über VehicleAssignment zugewiesene Fahrzeuge.
 */
export function vehicleWhere(actor: Actor, includeArchived = false): Prisma.VehicleWhereInput {
  const base: Prisma.VehicleWhereInput = includeArchived ? {} : { archivedAt: null };
  if (actor.status !== "ACTIVE") return { id: { in: [] } };
  if (can(actor, "vehicles.view_all")) return base;
  return { ...base, assignments: { some: { userId: actor.id } } };
}

/** Relationsfilter für Datensätze, die an einem Fahrzeug hängen. */
export function viaVehicle(actor: Actor): { vehicle: Prisma.VehicleWhereInput } {
  return { vehicle: vehicleWhere(actor, true) };
}

export async function accessibleVehicleIds(actor: Actor, tx: Tx = db): Promise<string[]> {
  const rows = await tx.vehicle.findMany({ where: vehicleWhere(actor), select: { id: true } });
  return rows.map((r) => r.id);
}

/** Wirft NOT_FOUND (nicht FORBIDDEN), damit fremde IDs nicht erraten werden können. */
export async function assertVehicleAccess(actor: Actor, vehicleId: string, tx: Tx = db, includeArchived = true) {
  const v = await tx.vehicle.findFirst({ where: { AND: [{ id: vehicleId }, vehicleWhere(actor, includeArchived)] } });
  if (!v) throw notFound("Fahrzeug nicht gefunden oder kein Zugriff.");
  return v;
}
