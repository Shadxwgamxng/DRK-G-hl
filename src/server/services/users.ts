import type { UserStatus } from "@prisma/client";
import { z } from "@/lib/validation";
import { checkbox, optText, reqText } from "@/lib/validation";
import { db } from "../db";
import type { Actor } from "../actor";
import { requirePermission } from "../actor";
import { audit, diff } from "../audit";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { hashPassword, passwordProblems, verifyPassword } from "../auth/password";
import { notify, recipientsFor } from "../notifications";
import { getSettings } from "../settings";
import { parse } from "../validate";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
let dummyHash: string | undefined;

// ───────────── Registrierung ─────────────

export const registerSchema = z
  .object({
    firstName: reqText(80),
    lastName: reqText(80),
    username: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[a-zA-Z0-9._-]+$/, "Nur Buchstaben, Ziffern, Punkt, Binde- und Unterstrich"),
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(1).max(200),
    passwordConfirm: z.string().min(1),
    position: optText(120),
    acceptTerms: checkbox().refine((v) => v, "Bitte Nutzungsbedingungen und Datenschutzhinweise akzeptieren"),
  })
  .superRefine((d, ctx) => {
    const p = passwordProblems(d.password);
    if (p) ctx.addIssue({ code: "custom", path: ["password"], message: p });
    if (d.password !== d.passwordConfirm) ctx.addIssue({ code: "custom", path: ["passwordConfirm"], message: "Passwörter stimmen nicht überein" });
  });

export async function registerUser(input: unknown) {
  const d = parse(registerSchema, input);
  const userRole = await db.role.findUnique({ where: { key: "USER" } });
  if (!userRole) throw new Error("Rollen nicht initialisiert – bitte `npm run db:seed` ausführen.");

  const existing = await db.user.findFirst({
    where: { OR: [{ username: { equals: d.username, mode: "insensitive" } }, { email: d.email }] },
    select: { username: true, email: true },
  });
  if (existing) {
    const fe: Record<string, string> = {};
    if (existing.username.toLowerCase() === d.username.toLowerCase()) fe.username = "Benutzername ist bereits vergeben";
    if (existing.email === d.email) fe.email = "E-Mail-Adresse ist bereits registriert";
    throw invalid("Registrierung nicht möglich.", fe);
  }

  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        firstName: d.firstName,
        lastName: d.lastName,
        username: d.username,
        email: d.email,
        position: d.position,
        passwordHash: await hashPassword(d.password),
        roleId: userRole.id,
        status: "PENDING",
        termsAcceptedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: { userId: u.id, action: "user.register", entityType: "User", entityId: u.id, newValues: { username: u.username, email: u.email } },
    });
    const admins = await recipientsFor({ permission: "users.manage" }, tx);
    await notify(
      admins,
      {
        type: "registration",
        title: "Neue Registrierung",
        body: `${u.firstName} ${u.lastName} (${u.username}) wartet auf Freigabe.`,
        link: `/admin/benutzer/${u.id}`,
        dedupeKey: `registration:${u.id}`,
      },
      tx,
    );
    return u;
  });
  return { id: user.id };
}

// ───────────── Anmeldung ─────────────

export type LoginResult = { ok: true; userId: string; status: UserStatus } | { ok: false; message: string };

export async function authenticate(identifier: string, password: string): Promise<LoginResult> {
  const generic = "Benutzername/E-Mail oder Passwort ist falsch.";
  const id = identifier.trim();
  if (!id || !password) return { ok: false, message: generic };
  const user = await db.user.findFirst({
    where: { OR: [{ username: { equals: id, mode: "insensitive" } }, { email: id.toLowerCase() }] },
  });
  if (!user) {
    dummyHash ??= await hashPassword("timing-ausgleich");
    await verifyPassword(password, dummyHash); // Laufzeit angleichen (keine Benutzer-Enumeration)
    return { ok: false, message: generic };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, message: "Zu viele Fehlversuche. Bitte später erneut versuchen." };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return { ok: false, message: generic };
  }
  if (user.status === "REJECTED") return { ok: false, message: "Die Registrierung wurde abgelehnt." };
  if (user.status === "DISABLED") return { ok: false, message: "Das Benutzerkonto ist deaktiviert." };
  if (user.status === "LOCKED") return { ok: false, message: "Das Benutzerkonto ist gesperrt. Bitte an die Administration wenden." };
  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  return { ok: true, userId: user.id, status: user.status };
}

// ───────────── Verwaltung ─────────────

export async function listUsers(actor: Actor, filter: { status?: string; q?: string } = {}) {
  requirePermission(actor, "users.manage");
  return db.user.findMany({
    where: {
      anonymizedAt: null,
      ...(filter.status ? { status: filter.status as UserStatus } : {}),
      ...(filter.q
        ? {
            OR: [
              { firstName: { contains: filter.q, mode: "insensitive" } },
              { lastName: { contains: filter.q, mode: "insensitive" } },
              { username: { contains: filter.q, mode: "insensitive" } },
              { email: { contains: filter.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { role: true, assignments: { include: { vehicle: { select: { id: true, name: true, licensePlate: true } } } } },
    orderBy: [{ status: "asc" }, { lastName: "asc" }],
  });
}

export async function getUser(actor: Actor, userId: string) {
  requirePermission(actor, "users.manage");
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { role: true, assignments: { include: { vehicle: true } } },
  });
  if (!u) throw notFound();
  return u;
}

async function loadTarget(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!u) throw notFound();
  return u;
}

async function ensureNotLastAdmin(userId: string) {
  const target = await loadTarget(userId);
  if (target.role.key !== "ADMIN" || target.status !== "ACTIVE") return;
  const activeAdmins = await db.user.count({ where: { status: "ACTIVE", role: { key: "ADMIN" } } });
  if (activeAdmins <= 1) throw conflict("Der letzte aktive Administrator kann nicht entzogen oder gesperrt werden.");
}

export async function approveUser(actor: Actor, userId: string, opts: { roleId?: string; vehicleIds?: string[] } = {}) {
  requirePermission(actor, "users.manage");
  const target = await loadTarget(userId);
  if (target.status !== "PENDING") throw conflict("Nur wartende Registrierungen können freigegeben werden.");
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { status: "ACTIVE", approvedAt: new Date(), approvedById: actor.id, ...(opts.roleId ? { roleId: opts.roleId } : {}) },
    });
    await audit(actor, { action: "user.approve", entityType: "User", entityId: userId, oldValues: { status: "PENDING" }, newValues: { status: "ACTIVE", roleId: opts.roleId } }, tx);
    await notify([userId], { type: "account", title: "Konto freigegeben", body: "Ihr Benutzerkonto wurde freigegeben.", link: "/", dedupeKey: `approved:${userId}` }, tx);
  });
  if (opts.vehicleIds?.length) await setVehicleAssignments(actor, userId, opts.vehicleIds);
}

export async function rejectUser(actor: Actor, userId: string, reason?: string) {
  requirePermission(actor, "users.manage");
  const target = await loadTarget(userId);
  if (target.status !== "PENDING") throw conflict("Nur wartende Registrierungen können abgelehnt werden.");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: "REJECTED", rejectedReason: reason?.slice(0, 500) } });
    await tx.session.deleteMany({ where: { userId } });
    await audit(actor, { action: "user.reject", entityType: "User", entityId: userId, oldValues: { status: "PENDING" }, newValues: { status: "REJECTED", reason } }, tx);
  });
}

/** Aktivieren, deaktivieren, sperren, entsperren. */
export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "DISABLED" | "LOCKED") {
  requirePermission(actor, "users.manage");
  if (userId === actor.id && status !== "ACTIVE") throw conflict("Das eigene Konto kann nicht gesperrt oder deaktiviert werden.");
  const target = await loadTarget(userId);
  if (target.status === "PENDING") throw conflict("Wartende Registrierungen bitte über Freigabe/Ablehnung bearbeiten.");
  if (status !== "ACTIVE") await ensureNotLastAdmin(userId);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status, failedLoginCount: 0, lockedUntil: null } });
    if (status !== "ACTIVE") await tx.session.deleteMany({ where: { userId } });
    await audit(actor, { action: "user.status", entityType: "User", entityId: userId, oldValues: { status: target.status }, newValues: { status } }, tx);
  });
}

const updateUserSchema = z.object({
  firstName: reqText(80),
  lastName: reqText(80),
  email: z.string().trim().toLowerCase().email().max(200),
  position: optText(120),
  roleId: z.string().min(1),
  allowMultipleVehicles: checkbox(),
  canPerformChecks: checkbox(),
});

export async function updateUser(actor: Actor, userId: string, input: unknown) {
  requirePermission(actor, "users.manage");
  const d = parse(updateUserSchema, input);
  const target = await loadTarget(userId);
  const role = await db.role.findUnique({ where: { id: d.roleId } });
  if (!role) throw invalid("Rolle unbekannt", { roleId: "Rolle unbekannt" });
  if (target.role.key === "ADMIN" && role.key !== "ADMIN") await ensureNotLastAdmin(userId);
  if (d.email !== target.email && (await db.user.findUnique({ where: { email: d.email } })))
    throw invalid("E-Mail bereits vergeben", { email: "E-Mail-Adresse ist bereits registriert" });

  const assignmentCount = await db.vehicleAssignment.count({ where: { userId } });
  if (!d.allowMultipleVehicles && assignmentCount > 1)
    throw invalid("Benutzer ist mehreren Fahrzeugen zugewiesen.", { allowMultipleVehicles: "Zuerst Zuweisungen auf ein Fahrzeug reduzieren" });

  const { oldValues, newValues, changed } = diff(target as unknown as Record<string, unknown>, d);
  if (!changed) return;
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: d });
    await audit(actor, { action: d.roleId !== target.roleId ? "user.role" : "user.update", entityType: "User", entityId: userId, oldValues, newValues }, tx);
    if (d.roleId !== target.roleId) await tx.session.deleteMany({ where: { userId } }); // Rechte sofort neu laden
  });
}

/** Setzt die Fahrzeugzuweisungen eines Benutzers (ersetzt die bisherigen). */
export async function setVehicleAssignments(actor: Actor, userId: string, vehicleIds: string[]) {
  requirePermission(actor, "users.manage");
  const target = await loadTarget(userId);
  const ids = [...new Set(vehicleIds.filter(Boolean))];
  const settings = await getSettings();
  if (ids.length > 1 && !(target.allowMultipleVehicles && settings.multiVehicleAssignmentEnabled)) {
    throw invalid("Mehrfachzuweisung ist für diesen Benutzer nicht aktiviert.", { vehicleIds: "Nur ein Fahrzeug zulässig" });
  }
  const vehicles = await db.vehicle.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true } });
  if (vehicles.length !== ids.length) throw invalid("Unbekanntes oder archiviertes Fahrzeug ausgewählt.");
  await db.$transaction(async (tx) => {
    const before = await tx.vehicleAssignment.findMany({ where: { userId }, select: { vehicleId: true } });
    const beforeIds = before.map((b) => b.vehicleId).sort();
    await tx.vehicleAssignment.deleteMany({ where: { userId, vehicleId: { notIn: ids } } });
    for (const vehicleId of ids) {
      await tx.vehicleAssignment.upsert({
        where: { userId_vehicleId: { userId, vehicleId } },
        create: { userId, vehicleId, assignedById: actor.id },
        update: {},
      });
    }
    if (JSON.stringify(beforeIds) !== JSON.stringify([...ids].sort())) {
      await audit(actor, { action: "user.assign", entityType: "User", entityId: userId, oldValues: { vehicleIds: beforeIds }, newValues: { vehicleIds: ids } }, tx);
      await notify([userId], { type: "account", title: "Fahrzeugzuweisung geändert", body: "Ihre Fahrzeugzuweisung wurde aktualisiert.", link: "/fahrzeuge" }, tx);
    }
  });
}

/** DSGVO: personenbezogene Daten entfernen, Datensätze (Kontrollen, Mängel, Protokoll) bleiben nachvollziehbar erhalten. */
export async function anonymizeUser(actor: Actor, userId: string) {
  requirePermission(actor, "users.manage");
  if (userId === actor.id) throw conflict("Das eigene Konto kann nicht anonymisiert werden.");
  await ensureNotLastAdmin(userId);
  const target = await loadTarget(userId);
  const placeholder = `geloescht-${userId.slice(-8)}`;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        firstName: "Gelöschter",
        lastName: "Benutzer",
        username: placeholder,
        email: `${placeholder}@invalid.local`,
        position: null,
        passwordHash: "!",
        status: "DISABLED",
        anonymizedAt: new Date(),
      },
    });
    await tx.session.deleteMany({ where: { userId } });
    await tx.vehicleAssignment.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await audit(actor, { action: "user.anonymize", entityType: "User", entityId: userId, oldValues: { username: target.username } }, tx);
  });
}

export async function changeOwnPassword(actor: Actor, current: string, next: string, confirm: string) {
  const u = await db.user.findUnique({ where: { id: actor.id } });
  if (!u) throw notFound();
  if (!(await verifyPassword(current, u.passwordHash))) throw invalid("Aktuelles Passwort ist falsch.", { current: "Falsches Passwort" });
  const p = passwordProblems(next);
  if (p) throw invalid(p, { password: p });
  if (next !== confirm) throw invalid("Passwörter stimmen nicht überein.", { passwordConfirm: "Passwörter stimmen nicht überein" });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(next) } });
    await audit(actor, { action: "user.password", entityType: "User", entityId: actor.id }, tx);
  });
}

export async function updateOwnPreferences(actor: Actor, emailNotifications: boolean) {
  await db.user.update({ where: { id: actor.id }, data: { emailNotifications } });
}

/** DSGVO-Auskunft: eigene gespeicherte Stammdaten. */
export async function exportOwnData(actor: Actor) {
  const u = await db.user.findUnique({
    where: { id: actor.id },
    select: {
      firstName: true,
      lastName: true,
      username: true,
      email: true,
      position: true,
      status: true,
      createdAt: true,
      approvedAt: true,
      lastLoginAt: true,
      termsAcceptedAt: true,
      role: { select: { name: true } },
      assignments: { select: { assignedAt: true, vehicle: { select: { name: true, licensePlate: true } } } },
      _count: { select: { checks: true, reportedDefects: true, stockMovements: true } },
    },
  });
  return u;
}

// ───────────── Rollen ─────────────

export async function listRoles(actor: Actor) {
  if (!actor.permissions.has("users.manage") && !actor.permissions.has("roles.manage")) throw forbidden();
  return db.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { name: "asc" } });
}

export async function setRolePermissions(actor: Actor, roleId: string, permissionKeys: string[]) {
  requirePermission(actor, "roles.manage");
  const role = await db.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw notFound();
  if (role.key === "ADMIN") throw conflict("Die Administrator-Rolle behält immer alle Rechte.");
  const perms = await db.permission.findMany({ where: { key: { in: permissionKeys } } });
  const before = role.permissions.map((p) => p.permission.key).sort();
  const after = perms.map((p) => p.key).sort();
  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) });
    await audit(actor, { action: "role.permissions", entityType: "Role", entityId: roleId, oldValues: { permissions: before }, newValues: { permissions: after } }, tx);
  });
}

export async function createRole(actor: Actor, input: { key: string; name: string; description?: string }) {
  requirePermission(actor, "roles.manage");
  const d = parse(
    z.object({ key: z.string().trim().toUpperCase().regex(/^[A-Z_]{3,30}$/, "Nur Großbuchstaben und _ (3–30 Zeichen)"), name: reqText(80), description: optText(300) }),
    input,
  );
  if (await db.role.findUnique({ where: { key: d.key } })) throw invalid("Schlüssel bereits vorhanden", { key: "Bereits vorhanden" });
  const role = await db.role.create({ data: d });
  await audit(actor, { action: "role.permissions", entityType: "Role", entityId: role.id, newValues: d });
  return role;
}
