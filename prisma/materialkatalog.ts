/** Importiert den Standard-Materialkatalog: `npm run db:materialkatalog` (mehrfach ausführbar). */
import { PrismaClient } from "@prisma/client";
import { importMaterialCatalog } from "./material-catalog";

const db = new PrismaClient();
importMaterialCatalog(db)
  .then((r) => console.log(`✔ Materialkatalog: ${r.created} Materialien und ${r.categories} Kategorien angelegt (${r.total} im Standardkatalog).`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
