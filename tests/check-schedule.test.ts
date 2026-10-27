import { describe, expect, it } from "vitest";
import { checkState, nextCheckDue } from "@/lib/check-schedule";
import { db, makeUser, makeVehicle } from "./helpers";
import { runReminders } from "@/server/services/reminders";
import { summarizeVehicles } from "@/server/services/vehicles";

const d = (s: string) => new Date(`${s}T10:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe("Fahrzeugkontrolle 1 × pro Kalendermonat", () => {
  it("berechnet die Fälligkeit bis Ende des Folgemonats", () => {
    expect(iso(nextCheckDue(d("2026-10-27"), 1, "MONTHS"))).toBe("2026-11-30");
    expect(iso(nextCheckDue(d("2026-10-01"), 1, "MONTHS"))).toBe("2026-11-30");
    expect(iso(nextCheckDue(d("2026-12-15"), 1, "MONTHS"))).toBe("2027-01-31");
    expect(iso(nextCheckDue(d("2027-01-31"), 1, "MONTHS"))).toBe("2027-02-28");
    // ohne bisherige Kontrolle: bis Ende des Monats, in dem das Fahrzeug angelegt wurde
    expect(iso(nextCheckDue(null, 1, "MONTHS", d("2026-10-27"), d("2026-10-05")))).toBe("2026-10-31");
    expect(iso(nextCheckDue(null, 1, "MONTHS", d("2026-12-03"), d("2026-10-05")))).toBe("2026-10-31"); // überfällig
    // Tagesintervall weiterhin möglich
    expect(iso(nextCheckDue(d("2026-10-27"), 7, "DAYS"))).toBe("2026-11-03");
  });

  it("Status: im Oktober kontrolliert → ok; im September kontrolliert → im Oktober fällig; August → überfällig", () => {
    const now = d("2026-10-20");
    expect(checkState(nextCheckDue(d("2026-10-02"), 1, "MONTHS"), "MONTHS", now).state).toBe("ok");
    expect(checkState(nextCheckDue(d("2026-09-28"), 1, "MONTHS"), "MONTHS", now).state).toBe("due");
    expect(checkState(nextCheckDue(d("2026-08-31"), 1, "MONTHS"), "MONTHS", now).state).toBe("overdue");
  });

  it("neue Fahrzeuge sind standardmäßig monatlich zu kontrollieren; Erinnerung kurz vor Monatsende, danach überfällig", async () => {
    const fm = await makeUser("FLEET_MANAGER");
    const v = await makeVehicle();
    await db.vehicleAssignment.create({ data: { userId: fm.id, vehicleId: v.id } });
    expect(v.checkIntervalValue).toBe(1);
    expect(v.checkIntervalUnit).toBe("MONTHS");
    const [s] = await summarizeVehicles(fm, { where: { id: v.id } });
    expect(["due", "ok"]).toContain(s.checkState);

    // Simulation: 3 Tage vor Monatsende ohne Kontrolle → Erinnerung (einmalig)
    const t = new Date();
    const monthEnd = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 10));
    const nearEnd = new Date(monthEnd.getTime() - 3 * 86400000);
    await runReminders(nearEnd);
    await runReminders(nearEnd);
    let notes = await db.notification.findMany({ where: { userId: fm.id, link: `/fahrzeuge/${v.id}` } });
    expect(notes.filter((n) => n.type === "check_due")).toHaveLength(1);
    expect(notes[0].title).toContain("Monatskontrolle");

    // Monat verstrichen → überfällig
    await runReminders(new Date(monthEnd.getTime() + 2 * 86400000));
    notes = await db.notification.findMany({ where: { userId: fm.id, link: `/fahrzeuge/${v.id}` } });
    expect(notes.some((n) => n.type === "check_overdue")).toBe(true);
  });
});
