import type { CheckType, Prisma } from "@prisma/client";
import { z, optDate, optInt, optText, reqText, optId } from "@/lib/validation";
import { db } from "../db";
import type { Actor } from "../actor";
import { can, requirePermission } from "../actor";
import { assertVehicleAccess, viaVehicle } from "../access";
import { audit } from "../audit";
import { conflict, invalid, notFound } from "../errors";
import { notify, recipientsFor } from "../notifications";
import { parse } from "../validate";
import { linkAttachments } from "./attachments";
import { createDefectTx, DEFECT_CATEGORIES, DEFECT_SEVERITIES, OFFLINE_THRESHOLD_MS } from "./defects";
import { applyMaterialResults, materialResultSchema, validateMaterialResults } from "./check-materials";

export const CHECK_TYPES = ["ROUTINE", "SHIFT_START", "AFTER_MISSION", "EXTENDED", "OTHER"] as const;

/** Checkliste für ein Fahrzeug: zuerst typspezifisch, sonst Standardliste. */
export async function checklistForVehicle(actor: Actor, vehicleId: string) {
  const vehicle = await assertVehicleAccess(actor, vehicleId);
  const include = { items: { where: { active: true }, orderBy: { sortOrder: "asc" as const } } };
  const specific = await db.checklist.findFirst({ where: { vehicleTypeId: vehicle.typeId, active: true }, include, orderBy: { updatedAt: "desc" } });
  const list = specific ?? (await db.checklist.findFirst({ where: { vehicleTypeId: null, active: true }, include, orderBy: { updatedAt: "desc" } }));
  return { vehicle, checklist: list };
}

const resultSchema = z.object({
  itemId: z.string().min(1),
  result: z.enum(["OK", "DEFECT", "NOT_APPLICABLE"], { errorMap: () => ({ message: "Bitte Ergebnis wählen" }) }),
  note: optText(2000),
  defect: z
    .object({
      title: reqText(150),
      description: optText(5000),
      severity: z.enum(DEFECT_SEVERITIES),
      category: z.enum(DEFECT_CATEGORIES),
    })
    .optional(),
});

const checkSchema = z.object({
  checklistId: z.string().min(1),
  checkType: z.enum(CHECK_TYPES),
  mileage: optInt(0, 5_000_000),
  remarks: optText(5000),
  results: z.array(resultSchema).min(1),
  // Materialprüfung (Beladung Fach für Fach)
  materials: z.array(materialResultSchema).max(2000).default([]),
  materialsLoadedAt: optDate(),
  // Offline-Erfassung
  clientRef: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  performedAt: optDate(),
});

/**
 * Schließt eine Fahrzeugkontrolle ab. Die Kontrolle ist danach unveränderlich (DB-Trigger);
 * Ergänzungen erfolgen ausschließlich als protokollierter Nachtrag.
 */
export async function performCheck(actor: Actor, vehicleId: string, input: unknown, attachmentIds: string[] = []) {
  requirePermission(actor, "checks.perform");
  const d = parse(checkSchema, input);

  if (d.clientRef) {
    const existing = await db.vehicleCheck.findUnique({ where: { clientRef: d.clientRef } });
    if (existing) {
      if (existing.performedById !== actor.id || existing.vehicleId !== vehicleId) throw conflict("Synchronisationskonflikt: Kennung bereits verwendet.");
      return { check: existing, duplicate: true, defectIds: [] as string[] };
    }
  }

  const { vehicle, checklist } = await checklistForVehicle(actor, vehicleId);
  if (vehicle.archivedAt) throw conflict("Archivierte Fahrzeuge können nicht kontrolliert werden.");
  if (!checklist || checklist.id !== d.checklistId) {
    throw conflict("Die Checkliste wurde zwischenzeitlich geändert. Bitte die Kontrolle mit der aktuellen Checkliste erneut öffnen.");
  }
  const items = new Map(checklist.items.map((i) => [i.id, i]));
  const answered = new Map(d.results.map((r) => [r.itemId, r]));
  const missing = checklist.items.filter((i) => !answered.has(i.id));
  if (missing.length) {
    const fe: Record<string, string> = {};
    for (const m of missing) fe[`item_${m.id}`] = "Bitte Ergebnis wählen";
    throw invalid(`Es fehlen Ergebnisse für ${missing.length} Prüfpunkt(e).`, fe);
  }
  for (const r of d.results) {
    if (!items.has(r.itemId)) throw conflict("Die Checkliste wurde zwischenzeitlich geändert. Bitte neu laden.");
    if (r.result === "DEFECT" && !r.note && !r.defect)
      throw invalid("Bei festgestellten Mängeln bitte eine Bemerkung angeben oder einen Mangel anlegen.", { [`note_${r.itemId}`]: "Bemerkung erforderlich" });
  }

  await validateMaterialResults(actor, vehicleId, d.materials, d.materialsLoadedAt);

  const now = new Date();
  const performedAt = d.performedAt && d.performedAt < now && d.clientRef ? d.performedAt : now;
  const outcome = d.results.some((r) => r.result === "DEFECT") || d.materials.some((m) => m.status === "DEFECT") ? "DEFECTS" : "OK";

  return db.$transaction(async (tx) => {
    const check = await tx.vehicleCheck.create({
      data: {
        vehicleId,
        checklistId: checklist.id,
        checklistName: checklist.name,
        checkType: d.checkType as CheckType,
        performedById: actor.id,
        performedAt,
        mileage: d.mileage,
        remarks: d.remarks,
        outcome,
        clientRef: d.clientRef,
        offlineCreatedAt: d.clientRef && d.performedAt && now.getTime() - performedAt.getTime() > OFFLINE_THRESHOLD_MS ? performedAt : null,
        results: {
          create: checklist.items.map((item) => {
            const r = answered.get(item.id)!;
            return { checklistItemId: item.id, label: item.label, sortOrder: item.sortOrder, result: r.result, note: r.note };
          }),
        },
      },
    });
    await linkAttachments(tx, actor, attachmentIds, { vehicleCheckId: check.id });

    // Direkt aus der Checkliste heraus Mängel anlegen
    const defectIds: string[] = [];
    for (const r of d.results) {
      if (r.result !== "DEFECT" || !r.defect) continue;
      const item = items.get(r.itemId)!;
      const { defect } = await createDefectTx(
        tx,
        actor,
        {
          vehicleId,
          title: r.defect.title,
          description: r.defect.description || r.note || `Festgestellt bei Kontrolle: ${item.label}`,
          category: r.defect.category,
          severity: r.defect.severity,
          mileage: d.mileage,
          affectsReadiness: r.defect.severity === "CRITICAL",
        },
        { vehicleCheckId: check.id, checkItemLabel: item.label },
      );
      defectIds.push(defect.id);
    }

    const mat = await applyMaterialResults(tx, actor, { vehicleId, checkId: check.id, performedAt, mileage: d.mileage }, d.materials);
    defectIds.push(...mat.defectIds);

    if (d.mileage && (!vehicle.mileage || d.mileage > vehicle.mileage)) {
      await tx.vehicle.update({ where: { id: vehicleId }, data: { mileage: d.mileage } });
    }
    await audit(actor, { action: "check.complete", entityType: "VehicleCheck", entityId: check.id, vehicleId, newValues: { outcome, checkType: d.checkType, items: d.results.length, materials: d.materials.length, materialDeviations: mat.deviations, defects: defectIds.length } }, tx);
    if (outcome === "DEFECTS") {
      const r = await recipientsFor({ permission: "defects.manage", vehicleId, excludeUserId: actor.id }, tx);
      await notify(r, { type: "check_defects", title: `Kontrolle mit Befund: ${vehicle.name}`, body: `${d.results.filter((x) => x.result === "DEFECT").length + d.materials.filter((m) => m.status === "DEFECT").length} Prüfpunkt(e) mit Mangel`, link: `/fahrzeuge/${vehicleId}/kontrollen/${check.id}`, dedupeKey: `check:${check.id}` }, tx);
    }
    return { check, duplicate: false, defectIds };
    // große Beladungen: viele Buchungen in einer Transaktion
  }, { timeout: 60_000, maxWait: 10_000 });
}

export async function listChecks(actor: Actor, filter: { vehicleId?: string; from?: Date; to?: Date } = {}, take = 100) {
  const where: Prisma.VehicleCheckWhereInput = { ...viaVehicle(actor) };
  if (filter.vehicleId) where.vehicleId = filter.vehicleId;
  if (filter.from || filter.to) where.performedAt = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };
  return db.vehicleCheck.findMany({
    where,
    include: {
      vehicle: { select: { id: true, name: true, licensePlate: true } },
      performedBy: { select: { firstName: true, lastName: true } },
      _count: { select: { results: { where: { result: "DEFECT" } }, attachments: true } },
    },
    orderBy: { performedAt: "desc" },
    take,
  });
}

export async function getCheck(actor: Actor, id: string) {
  const c = await db.vehicleCheck.findFirst({
    where: { id, ...viaVehicle(actor) },
    include: {
      vehicle: true,
      performedBy: { select: { firstName: true, lastName: true } },
      results: { orderBy: { sortOrder: "asc" } },
      materialResults: { where: can(actor, "materials.btm") ? {} : { isNarcotic: false }, orderBy: [{ compartment: "asc" }, { sortOrder: "asc" }] },
      attachments: { orderBy: { createdAt: "asc" } },
      defects: { select: { id: true, title: true, status: true, severity: true, checkItemLabel: true } },
    },
  });
  if (!c) throw notFound("Kontrolle nicht gefunden oder kein Zugriff.");
  return c;
}

export type CheckAmendment = { at: string; userId: string; userName: string; text: string };

/** Nachtrag zu einer abgeschlossenen Kontrolle – Originaldaten bleiben unverändert. */
export async function amendCheck(actor: Actor, id: string, text: string) {
  requirePermission(actor, "checks.amend");
  const c = await getCheck(actor, id);
  const t = text?.trim();
  if (!t) throw invalid("Bitte den Nachtrag eingeben.", { text: "Pflichtfeld" });
  if (t.length > 4000) throw invalid("Nachtrag zu lang", { text: "Höchstens 4000 Zeichen" });
  const amendments = (c.amendments as CheckAmendment[]) ?? [];
  const entry: CheckAmendment = { at: new Date().toISOString(), userId: actor.id, userName: `${actor.firstName} ${actor.lastName}`, text: t };
  await db.$transaction(async (tx) => {
    await tx.vehicleCheck.update({ where: { id }, data: { amendments: [...amendments, entry] } });
    await audit(actor, { action: "check.amend", entityType: "VehicleCheck", entityId: id, vehicleId: c.vehicleId, oldValues: { amendments: amendments.length }, newValues: entry }, tx);
  });
}

// ───────────── Checklisten-Konfiguration ─────────────

export async function listChecklists(actor: Actor) {
  requirePermission(actor, "checklists.manage");
  return db.checklist.findMany({
    include: { vehicleType: true, items: { orderBy: { sortOrder: "asc" } }, _count: { select: { checks: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

const checklistSchema = z.object({
  id: optId(),
  name: reqText(120),
  description: optText(1000),
  vehicleTypeId: optId(),
  active: z.boolean(),
  items: z
    .array(z.object({ id: optId(), label: reqText(200), description: optText(500), active: z.boolean() }))
    .min(1, "Mindestens ein Prüfpunkt erforderlich"),
});

/**
 * Speichert eine Checkliste. Bereits verwendete Prüfpunkte werden nie gelöscht, sondern deaktiviert,
 * damit vergangene Kontrollen vollständig nachvollziehbar bleiben.
 */
export async function saveChecklist(actor: Actor, input: unknown) {
  requirePermission(actor, "checklists.manage");
  const d = parse(checklistSchema, input);
  return db.$transaction(async (tx) => {
    if (d.active) {
      // nur eine aktive Liste je Fahrzeugtyp (bzw. eine Standardliste)
      await tx.checklist.updateMany({ where: { vehicleTypeId: d.vehicleTypeId ?? null, active: true, ...(d.id ? { id: { not: d.id } } : {}) }, data: { active: false } });
    }
    const list = d.id
      ? await tx.checklist.update({ where: { id: d.id }, data: { name: d.name, description: d.description ?? null, vehicleTypeId: d.vehicleTypeId ?? null, active: d.active } })
      : await tx.checklist.create({ data: { name: d.name, description: d.description, vehicleTypeId: d.vehicleTypeId, active: d.active } });
    const existing = await tx.checklistItem.findMany({ where: { checklistId: list.id } });
    const keep = new Set(d.items.map((i) => i.id).filter(Boolean));
    for (const e of existing) {
      if (!keep.has(e.id)) {
        const used = await tx.vehicleCheckResult.count({ where: { checklistItemId: e.id } });
        if (used) await tx.checklistItem.update({ where: { id: e.id }, data: { active: false } });
        else await tx.checklistItem.delete({ where: { id: e.id } });
      }
    }
    for (const [idx, item] of d.items.entries()) {
      if (item.id && existing.some((e) => e.id === item.id)) {
        await tx.checklistItem.update({ where: { id: item.id }, data: { label: item.label, description: item.description ?? null, active: item.active, sortOrder: idx } });
      } else {
        await tx.checklistItem.create({ data: { checklistId: list.id, label: item.label, description: item.description, active: item.active, sortOrder: idx } });
      }
    }
    await audit(actor, { action: "checklist.update", entityType: "Checklist", entityId: list.id, newValues: { name: d.name, items: d.items.map((i) => i.label) } }, tx);
    return list;
  });
}
