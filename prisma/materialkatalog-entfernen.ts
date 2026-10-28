/**
 * Entfernt die Materialien des Standardkatalogs wieder.
 *
 *   npx tsx prisma/materialkatalog-entfernen.ts                 → nur anzeigen (ändert nichts)
 *   npx tsx prisma/materialkatalog-entfernen.ts --ausfuehren    → tatsächlich entfernen
 *   … --kategorie "Medikamente"                                 → nur eine Kategorie (mehrfach möglich)
 *
 * Nie verwendete Materialien (kein Fahrzeug, kein Lager, keine Buchung, keine Nachfüllung) werden gelöscht,
 * verwendete nur archiviert – damit Buchungen und Kontrollen nachvollziehbar bleiben.
 * Vom Katalog angelegte Kategorien werden gelöscht, sobald sie leer sind.
 */
import { PrismaClient } from "@prisma/client";
import { CATALOG_CATEGORIES, CATALOG_ITEMS } from "./material-catalog";

// Kategorien, die erst der Katalog-Import anlegt (die übrigen gehören zu den Basisdaten)
const CATALOG_ONLY_CATEGORIES = ["Trauma und Immobilisation", "Geburt und Kindernotfall", "Betäubungsmittel (BtM)", "Rettungs- und Transportgeräte"];

export async function removeMaterialCatalog(db: PrismaClient, opts: { execute: boolean; categories?: string[] }) {
  const wanted = opts.categories?.length ? new Set(opts.categories.map((c) => c.toLowerCase())) : null;
  if (wanted) {
    const known = new Set(CATALOG_CATEGORIES.map((c) => c.name.toLowerCase()));
    const unknown = [...wanted].filter((c) => !known.has(c));
    if (unknown.length) throw new Error(`Unbekannte Kategorie(n): ${unknown.join(", ")}. Möglich: ${CATALOG_CATEGORIES.map((c) => `„${c.name}“`).join(", ")}`);
  }
  const names = CATALOG_ITEMS.filter((i) => !wanted || wanted.has(i.category.toLowerCase())).map((i) => i.name);
  const materials = await db.material.findMany({
    where: { name: { in: names, mode: "insensitive" } },
    include: { _count: { select: { vehicleStocks: true, warehouseStocks: true, batches: true, movements: true, refillRequests: true } } },
  });
  const unused = materials.filter((m) => Object.values(m._count).every((n) => n === 0));
  const used = materials.filter((m) => !unused.includes(m));
  const toArchive = used.filter((m) => !m.archived);

  if (opts.execute) {
    await db.$transaction(async (tx) => {
      if (unused.length) await tx.material.deleteMany({ where: { id: { in: unused.map((m) => m.id) } } });
      if (toArchive.length) await tx.material.updateMany({ where: { id: { in: toArchive.map((m) => m.id) } }, data: { archived: true } });
      for (const name of CATALOG_ONLY_CATEGORIES) {
        const cat = await tx.materialCategory.findFirst({ where: { name }, include: { _count: { select: { materials: true } } } });
        if (cat && cat._count.materials === 0) await tx.materialCategory.delete({ where: { id: cat.id } });
      }
      await tx.auditLog.create({
        data: {
          action: "master.catalog_remove",
          entityType: "Material",
          newValues: { deleted: unused.length, archived: toArchive.length, categories: opts.categories ?? "alle" },
        },
      });
    });
  }
  return { found: materials.length, deleted: unused.length, archived: toArchive.length, usedNames: used.map((m) => m.name) };
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--ausfuehren");
  const categories: string[] = [];
  args.forEach((a, i) => a === "--kategorie" && args[i + 1] && categories.push(args[i + 1]));
  const db = new PrismaClient();
  try {
    const r = await removeMaterialCatalog(db, { execute, categories });
    const scope = categories.length ? ` (Kategorie: ${categories.join(", ")})` : "";
    console.log(`${r.found} Katalog-Materialien gefunden${scope}.`);
    console.log(`  ${execute ? "Gelöscht" : "Würden gelöscht"}: ${r.deleted} (nie verwendet)`);
    console.log(`  ${execute ? "Archiviert" : "Würden archiviert"}: ${r.archived} (bereits in Fahrzeug, Lager oder Buchungen verwendet)`);
    if (r.usedNames.length) console.log(`  Verwendet: ${r.usedNames.slice(0, 15).join(", ")}${r.usedNames.length > 15 ? " …" : ""}`);
    if (!execute) console.log("\nEs wurde NICHTS geändert. Zum Ausführen denselben Befehl mit --ausfuehren aufrufen.");
    else console.log("\n✔ Erledigt.");
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.includes("materialkatalog-entfernen")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
