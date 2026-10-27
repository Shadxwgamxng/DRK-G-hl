import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Bereitet die separate Test-Datenbank vor: Migrationen anwenden (nicht destruktiv),
 * anschließend alle Tabellen leeren und Basisdaten neu anlegen.
 * Sicherheitsnetz: läuft nur, wenn der Datenbankname „test“ enthält.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://drk:drk@localhost:5432/drk_kfz_test?schema=public";
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName)) throw new Error(`Abbruch: „${dbName}“ ist keine Test-Datenbank.`);
  const env = { ...process.env, DATABASE_URL: url, SEED_ADMIN_PASSWORD: "" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });

  const db = new PrismaClient({ datasources: { db: { url } } });
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  // TRUNCATE löst keine Zeilen-Trigger aus (Unveränderlichkeits-Trigger bleiben für Tests aktiv)
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.$disconnect();
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
