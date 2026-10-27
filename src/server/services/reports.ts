import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { fmtDate, fmtDateTime, fmtEuro } from "@/lib/format";
import {
  AUDIT_ACTION,
  CHECK_OUTCOME,
  CHECK_TYPE,
  DEFECT_CATEGORY,
  DEFECT_SEVERITY,
  DEFECT_STATUS,
  MOVEMENT_REASON,
  MOVEMENT_TYPE,
  REFILL_STATUS,
  VEHICLE_STATUS,
} from "@/lib/labels";
import { db } from "../db";
import type { Actor } from "../actor";
import { requirePermission } from "../actor";
import { assertVehicleAccess, viaVehicle } from "../access";
import { forbidden, invalid } from "../errors";
import { getSettings } from "../settings";
import { listChecks } from "./checks";
import { listDefects } from "./defects";
import { listInspections } from "./inspections";
import { expiringBatches } from "./materials";
import { listRefills } from "./refills";
import { summarizeVehicles } from "./vehicles";
import { listMovements } from "./warehouse";

export type Report = { title: string; subtitle?: string; columns: string[]; rows: (string | number)[][] };

export const REPORT_TYPES: Record<string, string> = {
  fahrzeuge: "Fahrzeugübersicht",
  fahrzeughistorie: "Fahrzeughistorie",
  kontrollen: "Kontrollberichte",
  maengel: "Mängelbericht",
  termine: "Wartungs- und Prüfübersicht",
  bestand: "Materialbestände",
  verfall: "Ablaufende und abgelaufene Materialien",
  bewegungen: "Lagerbewegungen",
  nachfuellung: "Nachfülllisten",
};

const name = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : "");

export type ReportParams = { vehicleId?: string; from?: Date; to?: Date; status?: string; severity?: string; category?: string; days?: number };

export async function buildReport(actor: Actor, type: string, p: ReportParams): Promise<Report> {
  requirePermission(actor, "reports.view");
  if (p.vehicleId) await assertVehicleAccess(actor, p.vehicleId);
  const period = p.from || p.to ? `Zeitraum: ${fmtDate(p.from, "…")} – ${fmtDate(p.to, "…")}` : undefined;

  switch (type) {
    case "fahrzeuge": {
      const vs = await summarizeVehicles(actor, { where: p.vehicleId ? { id: p.vehicleId } : {} });
      return {
        title: REPORT_TYPES.fahrzeuge,
        columns: ["Fahrzeug", "Kennzeichen", "Typ", "Status", "Letzte Kontrolle", "Nächste Kontrolle", "Nächste HU", "Nächste Wartung", "Offene Mängel", "Fehlendes Material", "Abgelaufen", "Bald ablaufend"],
        rows: vs.map((v) => [
          v.name,
          v.licensePlate,
          v.type.name,
          VEHICLE_STATUS[v.status],
          fmtDate(v.lastCheck?.performedAt),
          fmtDate(v.nextCheckDue),
          fmtDate(v.nextHu?.dueDate),
          v.nextMaintenance ? `${v.nextMaintenance.title} (${fmtDate(v.nextMaintenance.dueDate)})` : "–",
          v.openDefects,
          v.missingMaterials,
          v.expiredBatches,
          v.expiringBatches,
        ]),
      };
    }
    case "fahrzeughistorie": {
      if (!p.vehicleId) throw invalid("Bitte ein Fahrzeug wählen.");
      const v = await assertVehicleAccess(actor, p.vehicleId);
      const logs = await db.auditLog.findMany({
        where: { vehicleId: p.vehicleId, ...(p.from || p.to ? { createdAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: p.to } : {}) } } : {}) },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        take: 2000,
      });
      return {
        title: `${REPORT_TYPES.fahrzeughistorie}: ${v.name} (${v.licensePlate})`,
        subtitle: period,
        columns: ["Zeitpunkt", "Benutzer", "Aktion", "Datensatz", "Details"],
        rows: logs.map((l) => [fmtDateTime(l.createdAt), name(l.user), AUDIT_ACTION[l.action] ?? l.action, l.entityType, compactJson(l.newValues)]),
      };
    }
    case "kontrollen": {
      const checks = await listChecks(actor, { vehicleId: p.vehicleId, from: p.from, to: p.to }, 2000);
      return {
        title: REPORT_TYPES.kontrollen,
        subtitle: period,
        columns: ["Datum", "Fahrzeug", "Kontrollart", "Prüfer", "km-Stand", "Ergebnis", "Prüfpunkte mit Mangel", "Bemerkungen"],
        rows: checks.map((c) => [fmtDateTime(c.performedAt), c.vehicle.name, CHECK_TYPE[c.checkType], name(c.performedBy), c.mileage ?? "", CHECK_OUTCOME[c.outcome], c._count.results, c.remarks ?? ""]),
      };
    }
    case "maengel": {
      const defects = await listDefects(actor, { vehicleId: p.vehicleId, from: p.from, to: p.to, status: p.status ?? "all", severity: p.severity, category: p.category }, 5000);
      return {
        title: REPORT_TYPES.maengel,
        subtitle: period,
        columns: ["Gemeldet", "Fahrzeug", "Titel", "Kategorie", "Schweregrad", "Status", "Gemeldet von", "Zuständig", "Frist"],
        rows: defects.map((d) => [fmtDateTime(d.reportedAt), d.vehicle.name, d.title, DEFECT_CATEGORY[d.category], DEFECT_SEVERITY[d.severity], DEFECT_STATUS[d.status], name(d.reportedBy), name(d.assignedTo), fmtDate(d.dueDate)]),
      };
    }
    case "termine": {
      const ins = await listInspections(actor, { vehicleId: p.vehicleId });
      return {
        title: REPORT_TYPES.termine,
        columns: ["Fahrzeug", "Prüfung", "Art", "Fällig am", "Zuletzt", "Intervall", "Zuständig", "Werkstatt/Prüfstelle", "Kosten (geschätzt)", "Status"],
        rows: ins.map((i) => [
          i.vehicle.name,
          i.title,
          i.type.name,
          fmtDate(i.dueDate),
          fmtDate(i.lastDate),
          i.intervalValue ? `${i.intervalValue} ${i.intervalUnit === "DAYS" ? "Tage" : i.intervalUnit === "MONTHS" ? "Monate" : "Jahre"}` : "–",
          name(i.assignedTo),
          i.workshop ?? "",
          i.estimatedCost ? fmtEuro(i.estimatedCost) : "",
          i.state === "overdue" ? `Überfällig (${-i.days} Tage)` : i.state === "due_soon" ? `Fällig in ${i.days} Tagen` : "OK",
        ]),
      };
    }
    case "bestand": {
      requirePermission(actor, "materials.view");
      const stocks = await db.vehicleMaterialStock.findMany({
        where: { active: true, ...viaVehicle(actor), ...(p.vehicleId ? { vehicleId: p.vehicleId } : {}), ...((await getSettings()).medicationsEnabled ? {} : { material: { category: { isMedication: false } } }) },
        include: { vehicle: { select: { name: true } }, material: { include: { category: true } }, batches: { where: { quantity: { gt: 0 } }, orderBy: { expiryDate: "asc" } }, refillLocation: { include: { warehouse: true } } },
        orderBy: [{ vehicle: { name: "asc" } }, { material: { name: "asc" } }],
      });
      return {
        title: REPORT_TYPES.bestand,
        columns: ["Fahrzeug", "Material", "Kategorie", "Lagerort im Fahrzeug", "Soll", "Ist", "Mindest", "Einheit", "Fehlmenge", "Chargen (Verfall)", "Nachfülllager", "Letzte Kontrolle"],
        rows: stocks.map((s) => [
          s.vehicle.name,
          s.material.name,
          s.material.category.name,
          s.compartment ?? "",
          s.targetQuantity,
          s.currentQuantity,
          s.minQuantity,
          s.material.unit,
          Math.max(0, s.targetQuantity - s.currentQuantity),
          s.batches.map((b) => `${b.batchNumber ?? "o. Nr."}: ${b.quantity} (${fmtDate(b.expiryDate)})`).join(", "),
          s.refillLocation ? `${s.refillLocation.warehouse.name}, ${s.refillLocation.name}` : "",
          fmtDate(s.lastCheckedAt),
        ]),
      };
    }
    case "verfall": {
      const { vehicleBatches, warehouseBatches } = await expiringBatches(actor, { days: p.days, vehicleId: p.vehicleId, includeWarehouse: true });
      const rows: (string | number)[][] = [
        ...vehicleBatches.map((b) => [fmtDate(b.expiryDate), b.material.name, b.batchNumber ?? "", b.quantity, b.material.unit, `Fahrzeug: ${b.vehicleStock!.vehicle.name}`, b.vehicleStock!.compartment ?? ""]),
        ...warehouseBatches.map((b) => [fmtDate(b.expiryDate), b.material.name, b.batchNumber ?? "", b.quantity, b.material.unit, `Lager: ${b.warehouseStock!.location.warehouse.name}`, b.warehouseStock!.location.name]),
      ];
      return { title: REPORT_TYPES.verfall, subtitle: p.days ? `Vorschau: ${p.days} Tage` : undefined, columns: ["Verfall", "Material", "Charge", "Menge", "Einheit", "Ort", "Fach/Regal"], rows };
    }
    case "bewegungen": {
      const ms = await listMovements(actor, { vehicleId: p.vehicleId, from: p.from, to: p.to }, 5000);
      return {
        title: REPORT_TYPES.bewegungen,
        subtitle: period,
        columns: ["Zeitpunkt", "Art", "Grund", "Material", "Menge", "Von", "Nach", "Charge", "Verfall", "Benutzer", "Bemerkung"],
        rows: ms.map((m) => [
          fmtDateTime(m.createdAt),
          MOVEMENT_TYPE[m.type],
          m.reason ? MOVEMENT_REASON[m.reason] : "",
          m.material.name,
          m.quantity,
          m.fromVehicleStock ? m.fromVehicleStock.vehicle.name : m.fromWarehouseStock ? `${m.fromWarehouseStock.location.warehouse.name} / ${m.fromWarehouseStock.location.name}` : "",
          m.toVehicleStock ? m.toVehicleStock.vehicle.name : m.toWarehouseStock ? `${m.toWarehouseStock.location.warehouse.name} / ${m.toWarehouseStock.location.name}` : "",
          m.batchNumber ?? "",
          fmtDate(m.expiryDate, ""),
          name(m.user),
          m.note ?? "",
        ]),
      };
    }
    case "nachfuellung": {
      const rs = await listRefills(actor, { status: p.status ?? "active", vehicleId: p.vehicleId });
      return {
        title: REPORT_TYPES.nachfuellung,
        columns: ["Fahrzeug", "Material", "Benötigt", "Einheit", "Soll", "Ist", "Grund", "Fach im Fahrzeug", "Nachfülllager", "Lagerplätze mit Bestand", "Gemeldet von", "Gemeldet am", "Status"],
        rows: rs.map((r) => [
          r.vehicle.name,
          r.material.name,
          r.requestedQuantity,
          r.material.unit,
          r.vehicleStock.targetQuantity,
          r.vehicleStock.currentQuantity,
          r.reason,
          r.vehicleStock.compartment ?? "",
          r.vehicleStock.refillLocation ? `${r.vehicleStock.refillLocation.warehouse.name}, ${r.vehicleStock.refillLocation.name}` : "",
          r.warehouseStocks.map((w) => `${w.location.name}: ${w.quantity}`).join(", "),
          name(r.reportedBy),
          fmtDateTime(r.createdAt),
          REFILL_STATUS[r.status],
        ]),
      };
    }
    default:
      throw forbidden("Unbekannter Bericht.");
  }
}

function compactJson(v: unknown) {
  if (!v || typeof v !== "object") return "";
  return Object.entries(v as Record<string, unknown>)
    .slice(0, 6)
    .map(([k, val]) => `${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`)
    .join("; ")
    .slice(0, 300);
}

// ───────────── Export ─────────────

/** CSV mit Semikolon und UTF-8-BOM (öffnet korrekt in deutschem Excel). Formel-Injection wird neutralisiert. */
export function toCsv(r: Report) {
  const esc = (v: string | number) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [r.columns, ...r.rows].map((row) => row.map(esc).join(";")).join("\r\n");
}

/** WinAnsi-kompatible Zeichen (Standardschrift); Umlaute bleiben erhalten. */
function clean(s: string) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E\xA0-\xFF€–—…]/g, "?");
}

function truncate(text: string, font: PDFFont, size: number, width: number) {
  let t = clean(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > width) t = t.slice(0, -1);
  return t + "…";
}

export async function toPdf(r: Report, actor: Actor) {
  const settings = await getSettings();
  const pdf = await PDFDocument.create();
  pdf.setTitle(r.title);
  pdf.setProducer("DRK Göhl – KFZ-Warte");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89;
  const H = 595.28; // A4 quer
  const M = 28;
  const size = 7.5;
  const rowH = 12;
  const usable = W - 2 * M;

  // Spaltenbreiten anhand der Inhaltslänge (gedeckelt)
  const lens = r.columns.map((c, i) => Math.min(40, Math.max(c.length, ...r.rows.slice(0, 200).map((row) => String(row[i] ?? "").length), 4)));
  const total = lens.reduce((a, b) => a + b, 0);
  const widths = lens.map((l) => (l / total) * usable);

  let page = pdf.addPage([W, H]);
  let y = H - M;
  let pageNo = 1;
  const header = () => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: rgb(0.9, 0, 0.02) });
    page.drawText(clean(settings.organizationName), { x: M, y: y - 8, size: 9, font: bold, color: rgb(0.9, 0, 0.02) });
    page.drawText(clean(`Erstellt am ${fmtDateTime(new Date())} von ${actor.firstName} ${actor.lastName} · Seite ${pageNo}`), { x: W - M - 300, y: y - 8, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 24;
    page.drawText(clean(r.title), { x: M, y, size: 13, font: bold });
    y -= 14;
    if (r.subtitle) {
      page.drawText(clean(r.subtitle), { x: M, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
    }
    y -= 4;
    page.drawRectangle({ x: M, y: y - 3, width: usable, height: rowH, color: rgb(0.17, 0.18, 0.2) });
    let x = M;
    r.columns.forEach((c, i) => {
      page.drawText(truncate(c, bold, size, widths[i] - 4), { x: x + 2, y, size, font: bold, color: rgb(1, 1, 1) });
      x += widths[i];
    });
    y -= rowH;
  };
  header();
  r.rows.forEach((row, idx) => {
    if (y < M + rowH) {
      page = pdf.addPage([W, H]);
      pageNo++;
      y = H - M;
      header();
    }
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - 3, width: usable, height: rowH, color: rgb(0.95, 0.95, 0.96) });
    let x = M;
    row.forEach((cell, i) => {
      page.drawText(truncate(String(cell ?? ""), font, size, widths[i] - 4), { x: x + 2, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      x += widths[i];
    });
    y -= rowH;
  });
  if (r.rows.length === 0) page.drawText("Keine Einträge für die gewählten Filter.", { x: M, y, size: 9, font });
  return Buffer.from(await pdf.save());
}
