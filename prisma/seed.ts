/**
 * Basis-Seed (idempotent): Rollen, Rechte, Stammdaten und – falls noch keiner existiert –
 * der Erst-Administrator aus den Umgebungsvariablen. Enthält KEINE Beispiel-Fahrzeuge.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS, SYSTEM_ROLES } from "../src/server/permissions";

const db = new PrismaClient();

const VEHICLE_TYPES = [
  ["RTW", "Rettungswagen"],
  ["KTW", "Krankentransportwagen"],
  ["MTW", "Mannschaftstransportwagen"],
  ["GW", "Gerätewagen"],
  ["Sonstiges", "Sonstiges Fahrzeug"],
];

// Bewusst OHNE voreingestellte Intervalle: Fristen hängen vom Fahrzeug/Gerät ab und werden je Termin konfiguriert.
const INSPECTION_TYPES: { key?: string; name: string; description: string; legacyName?: string }[] = [
  { key: "HU", name: "TÜV – Hauptuntersuchung (HU/AU)", description: "Hauptuntersuchung inkl. Abgasuntersuchung nach § 29 StVZO (TÜV, DEKRA, GTÜ …)", legacyName: "Hauptuntersuchung (HU)" },
  { key: "SP", name: "TÜV – Sicherheitsprüfung (SP)", description: "Nur falls für das Fahrzeug relevant (z. B. Lkw über 7,5 t)", legacyName: "Sicherheitsprüfung (SP)" },
  { key: "SERVICE", name: "Inspektion / Wartung", description: "Herstellervorgaben beachten" },
  { name: "Ölwechsel", description: "" },
  { name: "Reifenwechsel", description: "" },
  { name: "Fahrzeug-/Geräteprüfung", description: "" },
  { name: "Prüfung elektrischer Geräte", description: "Intervall gemäß Gefährdungsbeurteilung festlegen" },
  { name: "Prüfung medizinischer Geräte (STK/MTK)", description: "Intervall gemäß Herstellerangaben / MPBetreibV festlegen" },
];

const CATEGORIES: [string, boolean][] = [
  ["Infusionen und Infusionszubehör", false],
  ["Medizinische Verbrauchsmaterialien", false],
  ["Verbandmaterial", false],
  ["Diagnostik", false],
  ["Beatmung und Atemwegssicherung", false],
  ["Medikamente", true],
  ["Hygiene und Schutzmaterial", false],
  ["Technische Ausstattung", false],
  ["Werkzeuge", false],
  ["Fahrzeugzubehör", false],
  ["Sonstiges", false],
];

const EXAMPLE_CHECKLIST = [
  "Fahrzeug außen kontrolliert",
  "Fahrzeug innen kontrolliert",
  "Beleuchtung und Signalanlage kontrolliert",
  "Reifen und sichtbare Schäden kontrolliert",
  "Kraftstoff- bzw. Ladezustand kontrolliert",
  "Sauberkeit und Hygiene kontrolliert",
  "Medizinische Geräte vorhanden und kontrolliert",
  "Materialbestand kontrolliert",
  "Verfallsdaten kontrolliert",
  "Fahrzeugpapiere vorhanden",
  "Erste-Hilfe- und Sicherheitsausstattung kontrolliert",
];

async function main() {
  const newPermissions = new Set<string>();
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    if (!(await db.permission.findUnique({ where: { key } }))) newPermissions.add(key);
    await db.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
  }
  const perms = await db.permission.findMany();
  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const existing = await db.role.findUnique({ where: { key } });
    const role = await db.role.upsert({
      where: { key },
      create: { key, name: def.name, description: def.description, isSystem: true },
      update: { name: def.name, description: def.description, isSystem: true },
    });
    // Rechte nur beim ersten Anlegen setzen (spätere Anpassungen durch Admins bleiben erhalten);
    // die Administrator-Rolle erhält immer alle Rechte. Neu eingeführte Rechte erhalten auch bestehende Rollen.
    if (!existing || key === "ADMIN" || def.permissions.some((pk) => newPermissions.has(pk))) {
      for (const pk of def.permissions.filter((pk) => !existing || key === "ADMIN" || newPermissions.has(pk))) {
        const p = perms.find((x) => x.key === pk)!;
        await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} });
      }
    }
  }

  for (const [name, description] of VEHICLE_TYPES) {
    await db.vehicleType.upsert({ where: { name }, create: { name, description }, update: {} });
  }
  for (const t of INSPECTION_TYPES) {
    const existing = await db.inspectionType.findFirst({ where: { OR: [{ name: t.name }, ...(t.key ? [{ key: t.key }] : [])] } });
    if (!existing) await db.inspectionType.create({ data: { key: t.key, name: t.name, description: t.description || null } });
    // Frühere Standardbezeichnung (ohne „TÜV“) übernehmen – von Admins umbenannte Arten bleiben unverändert
    else if (t.legacyName && existing.name === t.legacyName) await db.inspectionType.update({ where: { id: existing.id }, data: { name: t.name, description: t.description } });
  }
  for (const [i, [name, isMedication]] of CATEGORIES.entries()) {
    await db.materialCategory.upsert({ where: { name }, create: { name, isMedication, sortOrder: i * 10 }, update: {} });
  }
  if ((await db.checklist.count()) === 0) {
    await db.checklist.create({
      data: {
        name: "Standard-Fahrzeugkontrolle (Beispiel)",
        description: "BEISPIEL – vor dem Einsatz durch die KFZ-Warte prüfen und je Fahrzeugtyp anpassen. Keine verbindliche Einsatzcheckliste.",
        vehicleTypeId: null,
        items: { create: EXAMPLE_CHECKLIST.map((label, i) => ({ label, sortOrder: i })) },
      },
    });
  }
  if ((await db.warehouse.count()) === 0) {
    await db.warehouse.create({ data: { name: "Materiallager", description: "Zentrales Lager", locations: { create: [{ name: "Regal 1" }, { name: "Regal 2" }, { name: "Regal 3" }] } } });
  }

  const adminRole = await db.role.findUniqueOrThrow({ where: { key: "ADMIN" } });
  const adminCount = await db.user.count({ where: { roleId: adminRole.id } });
  if (adminCount === 0) {
    const username = process.env.SEED_ADMIN_USERNAME;
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!username || !email || !password || password.includes("BITTE")) {
      console.warn("⚠ Kein Administrator angelegt: SEED_ADMIN_USERNAME/EMAIL/PASSWORD setzen und Seed erneut ausführen.");
    } else {
      await db.user.create({
        data: {
          firstName: "System",
          lastName: "Administrator",
          username,
          email: email.toLowerCase(),
          passwordHash: await bcrypt.hash(password, 12),
          roleId: adminRole.id,
          status: "ACTIVE",
          approvedAt: new Date(),
          termsAcceptedAt: new Date(),
        },
      });
      console.log(`✔ Administrator „${username}“ angelegt. Bitte Passwort nach der ersten Anmeldung ändern.`);
    }
  }
  console.log("✔ Basisdaten eingerichtet.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
