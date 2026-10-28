import type { CompartmentKind } from "@prisma/client";
import { z, optInt, optId, reqText } from "@/lib/validation";
import { db, type Tx } from "../db";
import type { Actor } from "../actor";
import { can, requirePermission } from "../actor";
import { assertVehicleAccess, vehicleWhere } from "../access";
import { audit } from "../audit";
import { conflict, invalid, notFound } from "../errors";
import { getSettings } from "../settings";
import { materialVisibility } from "../material-visibility";
import { parse } from "../validate";

/**
 * Lagerorte im Fahrzeug – zwei Ebenen: Schrank/Behälter (Rucksack, Tasche, Auszug …) → Fach.
 * Materialpositionen liegen in einem Fach oder direkt im Schrank/Behälter.
 */

export const CONTAINER_KINDS = ["CABINET", "DRAWER", "BACKPACK", "BAG", "BOX", "SHELF", "OTHER"] as const;
export const SEPARATOR = " › ";

export function compartmentLabel(c: { name: string; parent?: { name: string } | null } | null | undefined) {
  if (!c) return null;
  return c.parent ? `${c.parent.name}${SEPARATOR}${c.name}` : c.name;
}

export async function listCompartments(actor: Actor, vehicleId: string) {
  requirePermission(actor, "materials.view");
  await assertVehicleAccess(actor, vehicleId);
  return db.vehicleCompartment.findMany({
    where: { vehicleId, parentId: null },
    include: { children: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Auswahlliste „Schrank“ bzw. „Schrank › Fach“ in Fahrzeugreihenfolge. */
export async function compartmentOptions(actor: Actor, vehicleId: string) {
  const tree = await listCompartments(actor, vehicleId);
  return tree.flatMap((c) => [{ value: c.id, label: c.name }, ...c.children.map((f) => ({ value: f.id, label: `${c.name}${SEPARATOR}${f.name}` }))]);
}

async function getCompartment(actor: Actor, id: string, tx: Tx = db) {
  const c = await tx.vehicleCompartment.findUnique({ where: { id }, include: { parent: true, children: true } });
  if (!c) throw notFound("Lagerort nicht gefunden.");
  await assertVehicleAccess(actor, c.vehicleId, tx);
  return c;
}

export async function getCompartmentForView(actor: Actor, vehicleId: string, id: string) {
  requirePermission(actor, "materials.view");
  const c = await getCompartment(actor, id);
  if (c.vehicleId !== vehicleId) throw notFound("Lagerort nicht gefunden.");
  return { ...c, children: [...c.children].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de")) };
}

async function assertUniqueName(tx: Tx, vehicleId: string, parentId: string | null, name: string, exceptId?: string) {
  const dup = await tx.vehicleCompartment.findFirst({ where: { vehicleId, parentId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (dup) throw invalid(parentId ? "Ein Fach mit diesem Namen gibt es hier bereits." : "Ein Schrank/Behälter mit diesem Namen gibt es bereits.", { name: "Bereits vorhanden" });
}

/** Aktualisiert die Anzeige „Schrank › Fach“ aller Positionen unterhalb eines Lagerorts. */
async function refreshLabels(tx: Tx, compartmentId: string) {
  const c = await tx.vehicleCompartment.findUniqueOrThrow({ where: { id: compartmentId }, include: { parent: true, children: true } });
  await tx.vehicleMaterialStock.updateMany({ where: { compartmentId: c.id }, data: { compartment: compartmentLabel(c) } });
  for (const f of c.children) await tx.vehicleMaterialStock.updateMany({ where: { compartmentId: f.id }, data: { compartment: `${c.name}${SEPARATOR}${f.name}` } });
}

const createSchema = z.object({
  name: reqText(80),
  kind: z.enum([...CONTAINER_KINDS, "COMPARTMENT"]).optional(),
  parentId: optId(),
  sortOrder: optInt(0, 10000),
});

export async function createCompartment(actor: Actor, vehicleId: string, input: unknown) {
  requirePermission(actor, "materials.manage");
  await assertVehicleAccess(actor, vehicleId, db, false);
  const d = parse(createSchema, input);
  return db.$transaction(async (tx) => {
    let parent = null;
    if (d.parentId) {
      parent = await tx.vehicleCompartment.findUnique({ where: { id: d.parentId } });
      if (!parent || parent.vehicleId !== vehicleId) throw notFound("Schrank/Behälter nicht gefunden.");
      if (parent.parentId) throw invalid("In einem Fach können keine weiteren Fächer angelegt werden.");
    }
    await assertUniqueName(tx, vehicleId, parent?.id ?? null, d.name);
    const max = await tx.vehicleCompartment.aggregate({ where: { vehicleId, parentId: parent?.id ?? null }, _max: { sortOrder: true } });
    const c = await tx.vehicleCompartment.create({
      data: {
        vehicleId,
        parentId: parent?.id ?? null,
        name: d.name,
        kind: (parent ? "COMPARTMENT" : (d.kind ?? "CABINET")) as CompartmentKind,
        sortOrder: d.sortOrder ?? (max._max.sortOrder ?? 0) + 10,
      },
    });
    await audit(actor, { action: "compartment.create", entityType: "VehicleCompartment", entityId: c.id, vehicleId, newValues: { name: c.name, kind: c.kind, parent: parent?.name } }, tx);
    return c;
  });
}

const updateSchema = z.object({
  name: reqText(80),
  kind: z.enum([...CONTAINER_KINDS, "COMPARTMENT"]).optional(),
  sortOrder: optInt(0, 10000),
  parentId: optId(), // nur für Fächer: in anderen Schrank verschieben
});

export async function updateCompartment(actor: Actor, id: string, input: unknown) {
  requirePermission(actor, "materials.manage");
  const before = await getCompartment(actor, id);
  await assertVehicleAccess(actor, before.vehicleId, db, false);
  const d = parse(updateSchema, input);
  return db.$transaction(async (tx) => {
    let parentId = before.parentId;
    if (before.parentId && d.parentId && d.parentId !== before.parentId) {
      const p = await tx.vehicleCompartment.findUnique({ where: { id: d.parentId } });
      if (!p || p.vehicleId !== before.vehicleId || p.parentId) throw invalid("Ziel-Schrank ungültig.", { parentId: "Ungültig" });
      parentId = p.id;
    }
    await assertUniqueName(tx, before.vehicleId, parentId, d.name, id);
    const c = await tx.vehicleCompartment.update({
      where: { id },
      data: {
        name: d.name,
        parentId,
        kind: before.parentId ? "COMPARTMENT" : ((d.kind ?? before.kind) as CompartmentKind),
        sortOrder: d.sortOrder ?? before.sortOrder,
      },
    });
    await refreshLabels(tx, id);
    await audit(
      actor,
      { action: "compartment.update", entityType: "VehicleCompartment", entityId: id, vehicleId: before.vehicleId, oldValues: { name: before.name, kind: before.kind, parentId: before.parentId, sortOrder: before.sortOrder }, newValues: { name: c.name, kind: c.kind, parentId: c.parentId, sortOrder: c.sortOrder } },
      tx,
    );
    return c;
  });
}

/** Löschen nur, wenn leer (keine Fächer, keine aktiven Materialpositionen). */
export async function deleteCompartment(actor: Actor, id: string) {
  requirePermission(actor, "materials.manage");
  const c = await getCompartment(actor, id);
  await assertVehicleAccess(actor, c.vehicleId, db, false);
  if (c.children.length) throw conflict("Bitte zuerst die Fächer in diesem Schrank/Behälter entfernen oder verschieben.");
  const active = await db.vehicleMaterialStock.count({ where: { compartmentId: id, active: true } });
  if (active) throw conflict(`Hier liegen noch ${active} Materialposition(en). Bitte zuerst verschieben oder entfernen.`);
  await db.$transaction(async (tx) => {
    await tx.vehicleCompartment.delete({ where: { id } });
    await audit(actor, { action: "compartment.delete", entityType: "VehicleCompartment", entityId: id, vehicleId: c.vehicleId, oldValues: { name: compartmentLabel(c) } }, tx);
  });
  return { vehicleId: c.vehicleId, parentId: c.parentId };
}

/** Findet „Schrank“ bzw. „Schrank › Fach“ oder legt es an (für Freitext-Angaben, Import, Altdaten). */
export async function ensureCompartmentPath(tx: Tx, vehicleId: string, containerName: string, fachName?: string | null) {
  const find = (parentId: string | null, name: string) => tx.vehicleCompartment.findFirst({ where: { vehicleId, parentId, name: { equals: name, mode: "insensitive" } } });
  let container = await find(null, containerName);
  if (!container) {
    const max = await tx.vehicleCompartment.aggregate({ where: { vehicleId, parentId: null }, _max: { sortOrder: true } });
    container = await tx.vehicleCompartment.create({ data: { vehicleId, name: containerName, kind: guessKind(containerName), sortOrder: (max._max.sortOrder ?? 0) + 10 } });
  }
  if (!fachName) return container;
  let fach = await find(container.id, fachName);
  if (!fach) {
    const max = await tx.vehicleCompartment.aggregate({ where: { vehicleId, parentId: container.id }, _max: { sortOrder: true } });
    fach = await tx.vehicleCompartment.create({ data: { vehicleId, parentId: container.id, name: fachName, kind: "COMPARTMENT", sortOrder: (max._max.sortOrder ?? 0) + 10 } });
  }
  return fach;
}

/** Zerlegt Freitext wie „Notfallrucksack – Fach Zugang“ oder „Schrank 2, Fach B“ in Schrank und Fach. */
export function splitCompartmentText(text: string): [string, string | null] {
  const t = text.trim();
  const m = t.match(/^(.+?)\s*(?:›|>|\s[–—-]\s|,|\/)\s*(.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : [t, null];
}

export function guessKind(name: string): CompartmentKind {
  const n = name.toLowerCase();
  if (n.includes("rucksack")) return "BACKPACK";
  if (n.includes("tasche") || n.includes("koffer")) return "BAG";
  if (n.includes("auszug") || n.includes("schublade")) return "DRAWER";
  if (n.includes("kiste") || n.includes("box")) return "BOX";
  if (n.includes("regal") || n.includes("ablage")) return "SHELF";
  if (n.includes("schrank") || n.includes("fach")) return "CABINET";
  return "OTHER";
}

/** Altdaten: Positionen mit Freitext-Fach in die Struktur übernehmen (idempotent, z. B. beim Start). */
export async function migrateLegacyCompartments() {
  const stocks = await db.vehicleMaterialStock.findMany({ where: { compartmentId: null, compartment: { not: null } }, select: { id: true, vehicleId: true, compartment: true } });
  let moved = 0;
  for (const s of stocks) {
    if (!s.compartment?.trim()) continue;
    await db.$transaction(async (tx) => {
      const [container, fach] = splitCompartmentText(s.compartment!);
      const c = await ensureCompartmentPath(tx, s.vehicleId, container, fach);
      await tx.vehicleMaterialStock.update({ where: { id: s.id }, data: { compartmentId: c.id, compartment: fach ? `${container}${SEPARATOR}${fach}` : container } });
    });
    moved++;
  }
  return moved;
}

/**
 * Übernimmt Schränke, Fächer und Soll-Beladung eines anderen Fahrzeugs (z. B. zweiter N-KTW).
 * Bestände werden NICHT kopiert (Ist = 0) – die tatsächlichen Mengen werden beim ersten Check erfasst.
 * Bereits vorhandene Positionen bleiben unverändert.
 */
export async function copyLoadout(actor: Actor, fromVehicleId: string, toVehicleId: string) {
  requirePermission(actor, "materials.manage");
  if (fromVehicleId === toVehicleId) throw invalid("Bitte ein anderes Fahrzeug wählen.", { fromVehicleId: "Gleiches Fahrzeug" });
  await assertVehicleAccess(actor, fromVehicleId);
  const target = await assertVehicleAccess(actor, toVehicleId, db, false);
  if (target.archivedAt) throw conflict("Das Fahrzeug ist archiviert.");
  const settings = await getSettings();
  const tree = await db.vehicleCompartment.findMany({ where: { vehicleId: fromVehicleId, parentId: null }, include: { children: true }, orderBy: { sortOrder: "asc" } });
  const stocks = await db.vehicleMaterialStock.findMany({
    where: { vehicleId: fromVehicleId, active: true, material: { archived: false, ...materialVisibility(actor, settings.medicationsEnabled) } },
    include: { compartmentRef: { include: { parent: true } } },
  });
  const skippedNarcotics = can(actor, "materials.btm") ? 0 : await db.vehicleMaterialStock.count({ where: { vehicleId: fromVehicleId, active: true, material: { isNarcotic: true } } });

  return db.$transaction(
    async (tx) => {
      let compartments = 0;
      let positions = 0;
      const map = new Map<string, string>();
      for (const c of tree) {
        const existed = await tx.vehicleCompartment.findFirst({ where: { vehicleId: toVehicleId, parentId: null, name: { equals: c.name, mode: "insensitive" } } });
        const nc = existed ?? (await tx.vehicleCompartment.create({ data: { vehicleId: toVehicleId, name: c.name, kind: c.kind, sortOrder: c.sortOrder } }));
        if (!existed) compartments++;
        map.set(c.id, nc.id);
        for (const f of c.children) {
          const fe = await tx.vehicleCompartment.findFirst({ where: { vehicleId: toVehicleId, parentId: nc.id, name: { equals: f.name, mode: "insensitive" } } });
          const nf = fe ?? (await tx.vehicleCompartment.create({ data: { vehicleId: toVehicleId, parentId: nc.id, name: f.name, kind: "COMPARTMENT", sortOrder: f.sortOrder } }));
          if (!fe) compartments++;
          map.set(f.id, nf.id);
        }
      }
      for (const s of stocks) {
        const compartmentId = s.compartmentId ? (map.get(s.compartmentId) ?? null) : null;
        const exists = await tx.vehicleMaterialStock.findFirst({ where: { vehicleId: toVehicleId, materialId: s.materialId, compartmentId, active: true } });
        if (exists) continue;
        await tx.vehicleMaterialStock.create({
          data: {
            vehicleId: toVehicleId,
            materialId: s.materialId,
            compartmentId,
            compartment: compartmentLabel(s.compartmentRef),
            targetQuantity: s.targetQuantity,
            minQuantity: s.minQuantity,
            refillLocationId: s.refillLocationId,
            remarks: s.remarks,
            currentQuantity: 0,
          },
        });
        positions++;
      }
      await audit(actor, { action: "loadout.copy", entityType: "Vehicle", entityId: toVehicleId, vehicleId: toVehicleId, newValues: { fromVehicleId, compartments, positions, skippedNarcotics } }, tx);
      return { compartments, positions, skippedNarcotics };
    },
    { timeout: 60_000 },
  );
}

/** Fahrzeuge, deren Beladung übernommen werden kann (sichtbar, mit Lagerorten oder Positionen). */
export async function copySourceOptions(actor: Actor, vehicleId: string) {
  return db.vehicle.findMany({
    where: { AND: [vehicleWhere(actor), { id: { not: vehicleId } }, { OR: [{ compartments: { some: {} } }, { stocks: { some: { active: true } } }] }] },
    select: { id: true, name: true, internalNumber: true },
    orderBy: { internalNumber: "asc" },
  });
}
