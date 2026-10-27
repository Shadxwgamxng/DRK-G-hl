import { describe, expect, it } from "vitest";
import { db, makeUser, makeVehicle } from "./helpers";
import { addDays, berlinToday } from "@/lib/format";
import { completeInspection, createInspection, listInspections } from "@/server/services/inspections";
import { runReminders } from "@/server/services/reminders";
import { buildReport, toCsv, toPdf } from "@/server/services/reports";
import { dashboardData } from "@/server/services/dashboard";

describe("HU- und Wartungstermine (Abnahme 13)", () => {
  it("erzeugt Erinnerungen 30/14/7 Tage vorher sowie bei Überfälligkeit – ohne Mehrfachmeldungen", async () => {
    const admin = await makeUser("ADMIN");
    const fm = await makeUser("FLEET_MANAGER");
    const v = await makeVehicle();
    await db.vehicleAssignment.create({ data: { userId: fm.id, vehicleId: v.id } });
    const hu = await db.inspectionType.findUniqueOrThrow({ where: { key: "HU" } });
    const today = berlinToday();
    const insp = await createInspection(admin, v.id, { typeId: hu.id, title: "HU", dueDate: addDays(today, 13).toISOString().slice(0, 10), intervalValue: 12, intervalUnit: "MONTHS", reminderDays: "30, 14, 7" });

    await runReminders();
    await runReminders(); // zweiter Lauf am selben Tag: keine Doppelung
    let notes = await db.notification.findMany({ where: { userId: fm.id, link: `/termine/${insp.id}` } });
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe("inspection_due");

    // 7-Tage-Stufe (simulierte Zeit) erzeugt genau eine weitere Meldung
    await runReminders(new Date(Date.now() + 7 * 86400000));
    notes = await db.notification.findMany({ where: { userId: fm.id, link: `/termine/${insp.id}` } });
    expect(notes).toHaveLength(2);

    // Überfällig
    await runReminders(new Date(Date.now() + 20 * 86400000));
    notes = await db.notification.findMany({ where: { userId: fm.id, link: `/termine/${insp.id}` }, orderBy: { createdAt: "asc" } });
    expect(notes.at(-1)!.type).toBe("inspection_overdue");

    const list = await listInspections(fm, { vehicleId: v.id });
    expect(list[0].state).toBe("due_soon");
    const dash = await dashboardData(fm);
    expect(dash.kpi.upcomingInspections).toBe(1);
  });

  it("Durchführung dokumentiert die Prüfung und setzt den nächsten Termin anhand des Intervalls", async () => {
    const admin = await makeUser("ADMIN");
    const v = await makeVehicle();
    const t = await db.inspectionType.findUniqueOrThrow({ where: { key: "SERVICE" } });
    const insp = await createInspection(admin, v.id, { typeId: t.id, title: "Inspektion", dueDate: "2026-11-01", intervalValue: 6, intervalUnit: "MONTHS", reminderDays: [14] });
    await completeInspection(admin, insp.id, { performedAt: "2026-10-20", workshop: "Werkstatt Müller", cost: "249,90", passed: "on" });
    const after = await db.inspection.findUniqueOrThrow({ where: { id: insp.id }, include: { records: true } });
    expect(after.dueDate.toISOString().slice(0, 10)).toBe("2027-04-20");
    expect(after.records[0].cost?.toString()).toBe("249.9");
  });

  it("Normale Benutzer dürfen keine Termine anlegen", async () => {
    const user = await makeUser("USER");
    const v = await makeVehicle();
    await db.vehicleAssignment.create({ data: { userId: user.id, vehicleId: v.id } });
    const t = await db.inspectionType.findFirstOrThrow();
    await expect(createInspection(user, v.id, { typeId: t.id, title: "x", dueDate: "2027-01-01", reminderDays: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Berichte & Export", () => {
  it("CSV neutralisiert Formel-Injection, PDF wird erzeugt", async () => {
    const admin = await makeUser("ADMIN");
    await makeVehicle();
    const csv = toCsv({ title: "t", columns: ["A", "B"], rows: [["=HYPERLINK(1)", "Größe; mit \"Zitat\""]] });
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain('"Größe; mit ""Zitat"""');
    const report = await buildReport(admin, "fahrzeuge", {});
    expect(report.rows.length).toBeGreaterThan(0);
    const pdf = await toPdf(report, admin);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("Berichte erfordern Berechtigung", async () => {
    const user = await makeUser("USER");
    await expect(buildReport(user, "fahrzeuge", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
