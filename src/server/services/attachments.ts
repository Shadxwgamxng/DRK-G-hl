import type { Attachment, Prisma } from "@prisma/client";
import { db, type Tx } from "../db";
import type { Actor } from "../actor";
import { can, requirePermission } from "../actor";
import { vehicleWhere } from "../access";
import { audit } from "../audit";
import { forbidden, invalid, notFound } from "../errors";
import { ALLOWED_TYPES, deleteStoredFile, maxUploadBytes, saveFile, sniffMimeType } from "../storage";

export type AttachmentTarget = {
  vehicleId?: string;
  defectId?: string;
  vehicleCheckId?: string;
  inspectionId?: string;
  maintenanceRecordId?: string;
  stockMovementId?: string;
};

function safeName(name: string) {
  return name.replace(/[\\/\0<>:"|?*\u0000-\u001f]/g, "_").slice(0, 150) || "datei";
}

/**
 * Speichert eine hochgeladene Datei privat. Der Anhang ist zunächst keinem Datensatz zugeordnet
 * und nur für den Hochladenden sichtbar, bis er per linkAttachments verknüpft wird.
 */
export async function createUpload(actor: Actor, file: { name: string; data: Buffer }) {
  requirePermission(actor, "attachments.upload");
  if (file.data.length === 0) throw invalid("Die Datei ist leer.");
  if (file.data.length > maxUploadBytes())
    throw invalid(`Die Datei ist zu groß (max. ${Math.round(maxUploadBytes() / 1024 / 1024)} MB).`);
  const mime = sniffMimeType(file.data);
  if (!mime || !ALLOWED_TYPES[mime]) throw invalid("Dateityp nicht erlaubt. Erlaubt sind JPG, PNG, WEBP, HEIC und PDF.");

  // Schutz vor Missbrauch: max. 200 unverknüpfte Uploads je Benutzer
  const pending = await db.attachment.count({
    where: { uploadedById: actor.id, vehicleId: null, defectId: null, vehicleCheckId: null, inspectionId: null, maintenanceRecordId: null, stockMovementId: null },
  });
  if (pending > 200) throw invalid("Zu viele nicht zugeordnete Uploads. Bitte zuerst bestehende Vorgänge abschließen.");

  const storageKey = await saveFile(file.data);
  try {
    return await db.attachment.create({
      data: { storageKey, originalName: safeName(file.name), mimeType: mime, size: file.data.length, kind: ALLOWED_TYPES[mime].kind, uploadedById: actor.id },
      select: { id: true, originalName: true, mimeType: true, size: true, kind: true },
    });
  } catch (e) {
    await deleteStoredFile(storageKey);
    throw e;
  }
}

/** Verknüpft eigene, noch nicht zugeordnete Uploads mit einem Datensatz (innerhalb der Transaktion). */
export async function linkAttachments(tx: Tx, actor: Actor, ids: string[] | undefined, target: AttachmentTarget) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (unique.length === 0) return 0;
  if (Object.values(target).filter(Boolean).length !== 1) throw new Error("Genau ein Ziel erforderlich");
  const res = await tx.attachment.updateMany({
    where: {
      id: { in: unique },
      uploadedById: actor.id,
      vehicleId: null,
      defectId: null,
      vehicleCheckId: null,
      inspectionId: null,
      maintenanceRecordId: null,
      stockMovementId: null,
    },
    data: target,
  });
  if (res.count !== unique.length) throw invalid("Mindestens ein Anhang ist ungültig oder bereits zugeordnet.");
  return res.count;
}

/** Ermittelt das Fahrzeug, über das der Zugriff auf einen Anhang geregelt wird. */
async function vehicleIdsForAttachment(a: Attachment & { materialImageOf?: { id: string } | null }): Promise<string[] | "material" | "warehouse" | null> {
  if (a.vehicleId) return [a.vehicleId];
  if (a.defectId) return [(await db.defect.findUniqueOrThrow({ where: { id: a.defectId }, select: { vehicleId: true } })).vehicleId];
  if (a.vehicleCheckId) return [(await db.vehicleCheck.findUniqueOrThrow({ where: { id: a.vehicleCheckId }, select: { vehicleId: true } })).vehicleId];
  if (a.inspectionId) return [(await db.inspection.findUniqueOrThrow({ where: { id: a.inspectionId }, select: { vehicleId: true } })).vehicleId];
  if (a.maintenanceRecordId)
    return [(await db.maintenanceRecord.findUniqueOrThrow({ where: { id: a.maintenanceRecordId }, select: { vehicleId: true } })).vehicleId];
  if (a.stockMovementId) {
    const m = await db.stockMovement.findUniqueOrThrow({
      where: { id: a.stockMovementId },
      select: { fromVehicleStock: { select: { vehicleId: true } }, toVehicleStock: { select: { vehicleId: true } } },
    });
    const ids = [m.fromVehicleStock?.vehicleId, m.toVehicleStock?.vehicleId].filter(Boolean) as string[];
    return ids.length ? ids : "warehouse";
  }
  if (a.materialImageOf) return "material";
  return null;
}

/** Zentrale Prüfung, ob ein Benutzer eine Datei abrufen darf (verwendet von /api/files/:id). */
export async function getAttachmentForDownload(actor: Actor, id: string) {
  if (actor.status !== "ACTIVE") throw forbidden();
  const a = await db.attachment.findUnique({ where: { id }, include: { materialImageOf: { select: { id: true } } } });
  if (!a) throw notFound("Datei nicht gefunden oder kein Zugriff.");
  const scope = await vehicleIdsForAttachment(a);
  if (scope === null) {
    if (a.uploadedById !== actor.id) throw notFound("Datei nicht gefunden oder kein Zugriff.");
    return a;
  }
  if (scope === "material") {
    if (!can(actor, "materials.view")) throw notFound("Datei nicht gefunden oder kein Zugriff.");
    return a;
  }
  if (scope === "warehouse") {
    if (!can(actor, "warehouse.view")) throw notFound("Datei nicht gefunden oder kein Zugriff.");
    return a;
  }
  if (a.inspectionId || a.maintenanceRecordId) {
    if (!can(actor, "inspections.view")) throw notFound("Datei nicht gefunden oder kein Zugriff.");
  }
  const visible = await db.vehicle.count({ where: { AND: [{ id: { in: scope } }, vehicleWhere(actor, true)] } });
  if (visible === 0) throw notFound("Datei nicht gefunden oder kein Zugriff.");
  return a;
}

export async function deleteAttachment(actor: Actor, id: string) {
  const a = await getAttachmentForDownload(actor, id);
  const linked = a.vehicleId || a.defectId || a.vehicleCheckId || a.inspectionId || a.maintenanceRecordId || a.stockMovementId;
  // Anhänge von Kontrollen und Lagerbewegungen sind Teil der revisionssicheren Dokumentation
  if (a.vehicleCheckId || a.stockMovementId) throw forbidden("Anhänge abgeschlossener Kontrollen und Lagerbewegungen können nicht gelöscht werden.");
  const own = a.uploadedById === actor.id;
  if (linked && !own && !can(actor, "vehicles.manage")) throw forbidden();
  await db.$transaction(async (tx) => {
    await tx.vehicle.updateMany({ where: { imageId: id }, data: { imageId: null } });
    await tx.attachment.delete({ where: { id } });
    await audit(actor, { action: "attachment.delete", entityType: "Attachment", entityId: id, vehicleId: a.vehicleId, oldValues: { name: a.originalName, defectId: a.defectId, inspectionId: a.inspectionId } }, tx);
  });
  await deleteStoredFile(a.storageKey);
}

/** Aufräumen: nicht zugeordnete Uploads, die älter als 48 h sind. */
export async function cleanupOrphanUploads() {
  const where: Prisma.AttachmentWhereInput = {
    createdAt: { lt: new Date(Date.now() - 48 * 3600 * 1000) },
    vehicleId: null,
    defectId: null,
    vehicleCheckId: null,
    inspectionId: null,
    maintenanceRecordId: null,
    stockMovementId: null,
    vehicleImageOf: null,
    materialImageOf: null,
  };
  const orphans = await db.attachment.findMany({ where, select: { id: true, storageKey: true } });
  for (const o of orphans) {
    await db.attachment.delete({ where: { id: o.id } });
    await deleteStoredFile(o.storageKey);
  }
  return orphans.length;
}
