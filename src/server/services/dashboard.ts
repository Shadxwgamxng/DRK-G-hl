import { addDays, berlinToday } from "@/lib/format";
import { ACTIVE_REFILL_STATUSES, OPEN_DEFECT_STATUSES } from "@/lib/labels";
import { db } from "../db";
import type { Actor } from "../actor";
import { can } from "../actor";
import { viaVehicle } from "../access";
import { getSettings } from "../settings";
import { summarizeVehicles } from "./vehicles";

/** Alle Kennzahlen werden live aus der Datenbank berechnet – gefiltert auf die sichtbaren Fahrzeuge. */
export async function dashboardData(actor: Actor) {
  const settings = await getSettings();
  const today = berlinToday();
  const soon = addDays(today, settings.expiryWarningDays);
  const vehicles = await summarizeVehicles(actor);
  const scope = viaVehicle(actor);

  const [criticalDefects, openDefectCount, upcomingInspections, expiredBatchCount, expiringBatchCount, openRefills, pendingUsers, missingStocks] = await Promise.all([
    db.defect.findMany({
      where: { ...scope, status: { in: [...OPEN_DEFECT_STATUSES] }, severity: "CRITICAL" },
      include: { vehicle: { select: { id: true, name: true } } },
      orderBy: { reportedAt: "desc" },
      take: 10,
    }),
    db.defect.count({ where: { ...scope, status: { in: [...OPEN_DEFECT_STATUSES] } } }),
    can(actor, "inspections.view")
      ? db.inspection.findMany({
          where: { ...scope, active: true, dueDate: { lte: addDays(today, 30) } },
          include: { vehicle: { select: { id: true, name: true } }, type: true },
          orderBy: { dueDate: "asc" },
          take: 15,
        })
      : Promise.resolve([]),
    can(actor, "materials.view")
      ? db.materialBatch.count({ where: { quantity: { gt: 0 }, expiryDate: { lt: today }, vehicleStock: { active: true, ...scope } } })
      : Promise.resolve(0),
    can(actor, "materials.view")
      ? db.materialBatch.count({ where: { quantity: { gt: 0 }, expiryDate: { gte: today, lte: soon }, vehicleStock: { active: true, ...scope } } })
      : Promise.resolve(0),
    db.refillRequest.count({ where: { ...scope, status: { in: [...ACTIVE_REFILL_STATUSES] } } }),
    can(actor, "users.manage") ? db.user.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    can(actor, "materials.view")
      ? db.vehicleMaterialStock.findMany({ where: { active: true, ...scope }, select: { currentQuantity: true, targetQuantity: true } })
      : Promise.resolve([]),
  ]);

  const active = vehicles.filter((v) => !v.archivedAt && v.status !== "OUT_OF_SERVICE");
  // „fällig“ = im laufenden Monat noch keine Kontrolle (bzw. bei Tagesintervall heute fällig)
  const checksDueToday = active.filter((v) => v.checkState === "due");
  const checksOverdue = active.filter((v) => v.checkState === "overdue");

  return {
    vehicles,
    kpi: {
      vehiclesTotal: vehicles.length,
      ready: vehicles.filter((v) => v.status === "READY").length,
      limited: vehicles.filter((v) => v.status === "LIMITED").length,
      notReady: vehicles.filter((v) => v.status === "NOT_READY").length,
      outOfService: vehicles.filter((v) => v.status === "OUT_OF_SERVICE").length,
      checksDueToday: checksDueToday.length,
      checksOverdue: checksOverdue.length,
      upcomingInspections: upcomingInspections.length,
      overdueInspections: upcomingInspections.filter((i) => i.dueDate < today).length,
      openDefects: openDefectCount,
      criticalDefects: criticalDefects.length,
      missingMaterials: missingStocks.filter((s) => s.currentQuantity < s.targetQuantity).length,
      expiredBatches: expiredBatchCount,
      expiringBatches: expiringBatchCount,
      openRefills,
      pendingUsers,
    },
    criticalDefects,
    upcomingInspections,
    checksDue: [...checksOverdue, ...checksDueToday],
    expiryWarningDays: settings.expiryWarningDays,
  };
}
