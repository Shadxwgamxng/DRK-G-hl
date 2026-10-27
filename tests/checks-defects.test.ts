import { describe, expect, it } from "vitest";
import { db, makeUser, makeVehicle, newRef } from "./helpers";
import { berlinToday } from "@/lib/format";
import { amendCheck, checklistForVehicle, performCheck } from "@/server/services/checks";
import { summarizeVehicles, setVehicleStatus } from "@/server/services/vehicles";
import { changeDefectStatus, createDefect, getDefect } from "@/server/services/defects";
import { createUpload } from "@/server/services/attachments";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000000200015e2a2c760000000049454e44ae426082", "hex");

async function setup() {
  const user = await makeUser("USER", { canPerformChecks: true });
  const v = await makeVehicle();
  await db.vehicleAssignment.create({ data: { userId: user.id, vehicleId: v.id } });
  const { checklist } = await checklistForVehicle(user, v.id);
  return { user, v, checklist: checklist! };
}

describe("Fahrzeugkontrolle (Abnahme 5)", () => {
  it("speichert die Kontrolle und aktualisiert die letzte Kontrolle", async () => {
    const { user, v, checklist } = await setup();
    const results = checklist.items.map((i) => ({ itemId: i.id, result: "OK" }));
    const { check } = await performCheck(user, v.id, { checklistId: checklist.id, checkType: "ROUTINE", mileage: "12345", results });
    expect(check.outcome).toBe("OK");
    const [summary] = await summarizeVehicles(user, { where: { id: v.id } });
    expect(summary.lastCheck?.id).toBe(check.id);
    expect(summary.lastCheck?.performedBy.firstName).toBe("Test");
    // 1 × pro Kalendermonat: nach einer Kontrolle heute ist die nächste bis Ende des Folgemonats fällig
    const t = berlinToday();
    const endNext = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 2, 0));
    expect(summary.nextCheckDue.toISOString()).toBe(endNext.toISOString());
    expect(summary.checkState).toBe("ok");
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: v.id } })).mileage).toBe(12345);
  });

  it("verlangt Ergebnisse für alle Prüfpunkte", async () => {
    const { user, v, checklist } = await setup();
    await expect(
      performCheck(user, v.id, { checklistId: checklist.id, checkType: "ROUTINE", results: [{ itemId: checklist.items[0].id, result: "OK" }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("legt aus der Checkliste direkt einen Mangel an", async () => {
    const { user, v, checklist } = await setup();
    const results = checklist.items.map((i, idx) =>
      idx === 2 ? { itemId: i.id, result: "DEFECT", note: "Blaulicht vorne links defekt", defect: { title: "Blaulicht defekt", severity: "HIGH", category: "ELECTRICAL" } } : { itemId: i.id, result: idx === 3 ? "NOT_APPLICABLE" : "OK" },
    );
    const { check, defectIds } = await performCheck(user, v.id, { checklistId: checklist.id, checkType: "SHIFT_START", results });
    expect(check.outcome).toBe("DEFECTS");
    expect(defectIds).toHaveLength(1);
    const defect = await db.defect.findUniqueOrThrow({ where: { id: defectIds[0] } });
    expect(defect.vehicleCheckId).toBe(check.id);
    expect(defect.checkItemLabel).toBe(checklist.items[2].label);
  });

  it("abgeschlossene Kontrollen sind revisionssicher (DB-Trigger), Nachträge werden protokolliert", async () => {
    const { user, v, checklist } = await setup();
    const admin = await makeUser("ADMIN");
    const { check } = await performCheck(user, v.id, { checklistId: checklist.id, checkType: "ROUTINE", results: checklist.items.map((i) => ({ itemId: i.id, result: "OK" })) });
    await expect(db.vehicleCheck.update({ where: { id: check.id }, data: { remarks: "manipuliert" } })).rejects.toThrow();
    await expect(db.vehicleCheckResult.updateMany({ where: { checkId: check.id }, data: { result: "DEFECT" } })).rejects.toThrow();
    await expect(db.vehicleCheck.delete({ where: { id: check.id } })).rejects.toThrow();
    await expect(amendCheck(user, check.id, "Nachtrag")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await amendCheck(admin, check.id, "Kilometerstand war falsch abgelesen: 12.400");
    const reloaded = await db.vehicleCheck.findUniqueOrThrow({ where: { id: check.id } });
    expect((reloaded.amendments as unknown[]).length).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: check.id, action: "check.amend" } })).toBe(1);
    // Änderungsprotokoll selbst ist unveränderlich
    await expect(db.auditLog.deleteMany({ where: { entityId: check.id } })).rejects.toThrow();
  });

  it("reguläre Benutzer ohne Freischaltung dürfen keine Kontrollen durchführen", async () => {
    const user = await makeUser("USER", { canPerformChecks: false });
    const v = await makeVehicle();
    await db.vehicleAssignment.create({ data: { userId: user.id, vehicleId: v.id } });
    const { checklist } = await checklistForVehicle(user, v.id);
    await expect(
      performCheck(user, v.id, { checklistId: checklist!.id, checkType: "ROUTINE", results: checklist!.items.map((i) => ({ itemId: i.id, result: "OK" })) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Mängelmanagement (Abnahme 6, 7)", () => {
  it("6) Mangel mit Foto wird gespeichert, kritischer Mangel löst Warnung aus", async () => {
    const user = await makeUser("USER");
    const fm = await makeUser("FLEET_MANAGER");
    const v = await makeVehicle();
    await db.vehicleAssignment.createMany({ data: [{ userId: user.id, vehicleId: v.id }, { userId: fm.id, vehicleId: v.id }] });
    const photo = await createUpload(user, { name: "foto.png", data: PNG });
    const { defect, readinessWarning } = await createDefect(user, { vehicleId: v.id, title: "Bremse quietscht", description: "Beim Anfahren", category: "VEHICLE_TECH", severity: "CRITICAL" }, [photo.id]);
    expect(readinessWarning).toBe(true);
    const loaded = await getDefect(user, defect.id);
    expect(loaded.attachments.map((a) => a.id)).toEqual([photo.id]);
    const notes = await db.notification.findMany({ where: { userId: fm.id, type: "defect_critical" } });
    expect(notes).toHaveLength(1);
  });

  it("7) Bearbeitung → behoben → kontrolliert abgeschlossen; Fahrzeug wird NICHT automatisch freigegeben", async () => {
    const user = await makeUser("USER");
    const fm = await makeUser("FLEET_MANAGER");
    const v = await makeVehicle();
    await db.vehicleAssignment.createMany({ data: [{ userId: user.id, vehicleId: v.id }, { userId: fm.id, vehicleId: v.id }] });
    const { defect } = await createDefect(user, { vehicleId: v.id, title: "Reifen", description: "Profil zu gering", category: "TIRES", severity: "HIGH", affectsReadiness: "on" });
    await setVehicleStatus(fm, v.id, "NOT_READY", "Reifen abgefahren");

    await expect(changeDefectStatus(user, defect.id, { status: "IN_PROGRESS" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await changeDefectStatus(fm, defect.id, { status: "REVIEWED" });
    await changeDefectStatus(fm, defect.id, { status: "WAITING_PARTS", comment: "Reifen bestellt" });
    await expect(changeDefectStatus(fm, defect.id, { status: "CLOSED" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(changeDefectStatus(fm, defect.id, { status: "RESOLVED" })).rejects.toMatchObject({ fieldErrors: { measures: expect.any(String) } });
    await changeDefectStatus(fm, defect.id, { status: "RESOLVED", measures: "Beide Vorderreifen gewechselt" });
    const { vehicleNeedsRelease } = await changeDefectStatus(fm, defect.id, { status: "CLOSED" });
    expect(vehicleNeedsRelease).toBe(true);

    const d = await getDefect(fm, defect.id);
    expect(d.status).toBe("CLOSED");
    expect(d.measures).toBe("Beide Vorderreifen gewechselt");
    expect(d.resolvedBy?.firstName).toBeDefined();
    expect(d.closedBy).not.toBeNull();
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("NOT_READY");

    await setVehicleStatus(fm, v.id, "READY");
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("READY");
    expect(await db.vehicleStatusChange.count({ where: { vehicleId: v.id } })).toBe(2);
  });
});

describe("Offline-Synchronisation (Abnahme 17)", () => {
  it("offline erfasste Vorgänge werden genau einmal übernommen (Idempotenz)", async () => {
    const user = await makeUser("USER", { canPerformChecks: true });
    const v = await makeVehicle();
    await db.vehicleAssignment.create({ data: { userId: user.id, vehicleId: v.id } });
    const { checklist } = await checklistForVehicle(user, v.id);
    const ref = newRef();
    const offlineAt = new Date(Date.now() - 3600_000);
    const payload = { checklistId: checklist!.id, checkType: "ROUTINE", results: checklist!.items.map((i) => ({ itemId: i.id, result: "OK" })), clientRef: ref, performedAt: offlineAt.toISOString() };
    const first = await performCheck(user, v.id, payload);
    const second = await performCheck(user, v.id, payload);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.check.id).toBe(first.check.id);
    expect(first.check.performedAt.toISOString()).toBe(offlineAt.toISOString());
    expect(first.check.offlineCreatedAt).not.toBeNull();
    expect(await db.vehicleCheck.count({ where: { vehicleId: v.id } })).toBe(1);

    const dref = newRef();
    const d1 = await createDefect(user, { vehicleId: v.id, title: "Offline", description: "erfasst im Keller", category: "OTHER", severity: "LOW", clientRef: dref, reportedAt: offlineAt.toISOString() });
    const d2 = await createDefect(user, { vehicleId: v.id, title: "Offline", description: "erfasst im Keller", category: "OTHER", severity: "LOW", clientRef: dref, reportedAt: offlineAt.toISOString() });
    expect(d2.duplicate).toBe(true);
    expect(d2.defect.id).toBe(d1.defect.id);
  });

  it("erkennt Konflikte, wenn die Checkliste zwischenzeitlich geändert wurde", async () => {
    const user = await makeUser("USER", { canPerformChecks: true });
    const v = await makeVehicle();
    await db.vehicleAssignment.create({ data: { userId: user.id, vehicleId: v.id } });
    const { checklist } = await checklistForVehicle(user, v.id);
    await expect(
      performCheck(user, v.id, { checklistId: "veraltet", checkType: "ROUTINE", results: checklist!.items.map((i) => ({ itemId: i.id, result: "OK" })), clientRef: newRef() }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
