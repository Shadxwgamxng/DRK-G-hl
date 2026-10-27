import { db } from "../db";
import type { Actor } from "../actor";
import { can } from "../actor";
import { vehicleWhere, viaVehicle } from "../access";

export type SearchHit = { type: string; title: string; subtitle?: string; href: string };

/** Globale Suche – liefert ausschließlich Datensätze, auf die der Benutzer Zugriff hat. */
export async function globalSearch(actor: Actor, q: string): Promise<SearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const contains = { contains: term, mode: "insensitive" as const };
  const hits: SearchHit[] = [];

  const vehicles = await db.vehicle.findMany({
    where: { AND: [vehicleWhere(actor, true), { OR: [{ name: contains }, { licensePlate: contains }, { radioCallSign: contains }, { internalNumber: contains }] }] },
    take: 10,
  });
  hits.push(...vehicles.map((v) => ({ type: "Fahrzeug", title: v.name, subtitle: `${v.licensePlate}${v.radioCallSign ? ` · ${v.radioCallSign}` : ""}`, href: `/fahrzeuge/${v.id}` })));

  const defects = await db.defect.findMany({
    where: { ...viaVehicle(actor), OR: [{ title: contains }, { description: contains }] },
    include: { vehicle: { select: { name: true } } },
    take: 10,
    orderBy: { reportedAt: "desc" },
  });
  hits.push(...defects.map((d) => ({ type: "Mangel", title: d.title, subtitle: d.vehicle.name, href: `/maengel/${d.id}` })));

  if (can(actor, "materials.view")) {
    const stocks = await db.vehicleMaterialStock.findMany({
      where: { active: true, ...viaVehicle(actor), material: { OR: [{ name: contains }, { articleNumber: contains }] } },
      include: { material: true, vehicle: { select: { id: true, name: true } } },
      take: 15,
    });
    hits.push(
      ...stocks.map((s) => ({
        type: "Material",
        title: s.material.name,
        subtitle: `${s.vehicle.name}${s.compartment ? ` · ${s.compartment}` : ""} · ${s.currentQuantity}/${s.targetQuantity} ${s.material.unit}`,
        href: `/fahrzeuge/${s.vehicleId}/material/${s.id}`,
      })),
    );
    const batches = await db.materialBatch.findMany({
      where: { batchNumber: contains, quantity: { gt: 0 }, vehicleStock: { ...viaVehicle(actor) } },
      include: { material: true, vehicleStock: { include: { vehicle: { select: { name: true } } } } },
      take: 10,
    });
    hits.push(
      ...batches.map((b) => ({
        type: "Charge",
        title: `${b.material.name} – Charge ${b.batchNumber}`,
        subtitle: b.vehicleStock?.vehicle.name,
        href: `/fahrzeuge/${b.vehicleStock?.vehicleId}/material/${b.vehicleStockId}`,
      })),
    );
  }
  if (can(actor, "warehouse.view")) {
    const ws = await db.warehouseStock.findMany({
      where: { material: { OR: [{ name: contains }, { articleNumber: contains }] } },
      include: { material: true, location: { include: { warehouse: true } } },
      take: 10,
    });
    hits.push(...ws.map((w) => ({ type: "Lager", title: w.material.name, subtitle: `${w.location.warehouse.name} · ${w.location.name} · ${w.quantity} ${w.material.unit}`, href: `/lager?q=${encodeURIComponent(w.material.name)}` })));
  }
  if (can(actor, "inspections.view")) {
    const insp = await db.inspection.findMany({
      where: { ...viaVehicle(actor), active: true, OR: [{ title: contains }, { workshop: contains }] },
      include: { vehicle: { select: { name: true } } },
      take: 10,
    });
    hits.push(...insp.map((i) => ({ type: "Termin", title: i.title, subtitle: i.vehicle.name, href: `/termine/${i.id}` })));
  }
  if (can(actor, "users.manage")) {
    const users = await db.user.findMany({
      where: { anonymizedAt: null, OR: [{ firstName: contains }, { lastName: contains }, { username: contains }, { email: contains }] },
      take: 10,
    });
    hits.push(...users.map((u) => ({ type: "Benutzer", title: `${u.firstName} ${u.lastName}`, subtitle: u.username, href: `/admin/benutzer/${u.id}` })));
  }
  return hits;
}
