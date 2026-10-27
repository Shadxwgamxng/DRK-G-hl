import { addDays, berlinToday, daysUntil, fmtDate, toDateInput } from "@/lib/format";
import { db } from "../db";
import { mailConfigured, sendMail } from "../mail";
import { notify, recipientsFor } from "../notifications";
import { getSettings } from "../settings";
import { cleanupOrphanUploads } from "./attachments";

/**
 * Erinnerungslauf (täglich per Cron, z. B. über /api/cron/reminders oder `npm run reminders`).
 * Mehrfachbenachrichtigungen werden über dedupeKey (Benutzer + Anlass + Stufe) verhindert.
 */
export async function runReminders(now = new Date()) {
  const settings = await getSettings();
  const today = berlinToday(now);
  let created = 0;

  // 1) Prüf- und Wartungstermine: Erinnerung an den konfigurierten Tagen (z. B. 30/14/7) sowie bei Überfälligkeit
  const inspections = await db.inspection.findMany({
    where: { active: true, vehicle: { archivedAt: null }, dueDate: { lte: addDays(today, 366) } },
    include: { vehicle: true, type: true },
  });
  for (const i of inspections) {
    const days = daysUntil(i.dueDate, now)!;
    const stage = days < 0 ? "overdue" : [...i.reminderDays].sort((a, b) => a - b).find((r) => days <= r);
    if (stage === undefined) continue;
    const recipients = new Set(await recipientsFor({ permission: "inspections.complete", vehicleId: i.vehicleId }));
    if (i.assignedToId) recipients.add(i.assignedToId);
    const overdue = stage === "overdue";
    created += await notify([...recipients], {
      type: overdue ? "inspection_overdue" : "inspection_due",
      title: overdue ? `ÜBERFÄLLIG: ${i.title} – ${i.vehicle.name}` : `${i.title} fällig am ${fmtDate(i.dueDate)} – ${i.vehicle.name}`,
      body: overdue ? `Fällig seit ${fmtDate(i.dueDate)}` : `Noch ${days} Tag(e)`,
      link: `/termine/${i.id}`,
      // je Fälligkeitsdatum und Stufe nur einmal
      dedupeKey: `insp:${i.id}:${toDateInput(i.dueDate)}:${stage}`,
    });
  }

  // 2) Abgelaufene / bald ablaufende Chargen in Fahrzeugen
  const soon = addDays(today, settings.expiryWarningDays);
  const batches = await db.materialBatch.findMany({
    where: { quantity: { gt: 0 }, expiryDate: { lte: soon }, vehicleStock: { active: true, vehicle: { archivedAt: null } } },
    include: { material: true, vehicleStock: { include: { vehicle: true } } },
  });
  for (const b of batches) {
    const vs = b.vehicleStock!;
    const expired = b.expiryDate! < today;
    const recipients = await recipientsFor({ permission: "materials.manage", vehicleId: vs.vehicleId });
    created += await notify(recipients, {
      type: expired ? "material_expired" : "material_expiring",
      title: `${expired ? "Abgelaufen" : "Läuft bald ab"}: ${b.material.name} – ${vs.vehicle.name}`,
      body: `${b.quantity} ${b.material.unit}, Charge ${b.batchNumber ?? "–"}, Verfall ${fmtDate(b.expiryDate)}${vs.compartment ? `, ${vs.compartment}` : ""}`,
      link: `/fahrzeuge/${vs.vehicleId}/material/${vs.id}`,
      dedupeKey: `batch:${b.id}:${expired ? "expired" : "expiring"}`,
    });
  }

  // 3) Überfällige Fahrzeugkontrollen
  const vehicles = await db.vehicle.findMany({
    where: { archivedAt: null, status: { not: "OUT_OF_SERVICE" } },
    include: { checks: { orderBy: { performedAt: "desc" }, take: 1 } },
  });
  for (const v of vehicles) {
    const last = v.checks[0];
    if (!last) continue;
    const due = addDays(berlinToday(last.performedAt), v.checkIntervalDays);
    if (daysUntil(due, now)! >= 0) continue;
    const recipients = await recipientsFor({ permission: "checks.perform", vehicleId: v.id });
    const managers = await recipientsFor({ permission: "defects.manage", vehicleId: v.id });
    created += await notify([...new Set([...recipients, ...managers])], {
      type: "check_overdue",
      title: `Fahrzeugkontrolle überfällig: ${v.name}`,
      body: `Letzte Kontrolle am ${fmtDate(last.performedAt)}`,
      link: `/fahrzeuge/${v.id}`,
      dedupeKey: `check-overdue:${v.id}:${last.id}`,
    });
  }

  // 4) Wartende Registrierungen (tägliche Sammelerinnerung)
  const pending = await db.user.count({ where: { status: "PENDING" } });
  if (pending > 0) {
    const admins = await recipientsFor({ permission: "users.manage" });
    created += await notify(admins, {
      type: "registration",
      title: `${pending} Registrierung(en) warten auf Freigabe`,
      link: "/admin/benutzer?status=PENDING",
      dedupeKey: `pending-users:${toDateInput(today)}`,
    });
  }

  const emailed = await sendPendingEmails();
  const orphans = await cleanupOrphanUploads();
  const expiredSessions = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { created, emailed, orphans, expiredSessions: expiredSessions.count };
}

/** Optionaler E-Mail-Versand für ungelesene Benachrichtigungen (nur wenn global und beim Benutzer aktiviert). */
export async function sendPendingEmails() {
  const settings = await getSettings();
  if (!settings.emailNotificationsEnabled || !mailConfigured()) return 0;
  const pending = await db.notification.findMany({
    where: { emailedAt: null, readAt: null, createdAt: { gt: new Date(Date.now() - 2 * 86400000) }, user: { status: "ACTIVE", emailNotifications: true } },
    include: { user: true },
    take: 500,
  });
  const byUser = new Map<string, typeof pending>();
  for (const n of pending) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
  let sent = 0;
  const base = process.env.APP_URL ?? "";
  for (const [, list] of byUser) {
    const u = list[0].user;
    const text = [
      `Hallo ${u.firstName},`,
      "",
      "es gibt neue Hinweise in der KFZ-Warte:",
      "",
      ...list.map((n) => `• ${n.title}${n.body ? ` – ${n.body}` : ""}${n.link ? `\n  ${base}${n.link}` : ""}`),
      "",
      "Diese E-Mail wurde automatisch erstellt. E-Mail-Benachrichtigungen können im Profil deaktiviert werden.",
    ].join("\n");
    try {
      await sendMail(u.email, `KFZ-Warte: ${list.length} neue Benachrichtigung(en)`, text);
      await db.notification.updateMany({ where: { id: { in: list.map((n) => n.id) } }, data: { emailedAt: new Date() } });
      sent += list.length;
    } catch (e) {
      console.error("E-Mail-Versand fehlgeschlagen", e);
    }
  }
  return sent;
}
