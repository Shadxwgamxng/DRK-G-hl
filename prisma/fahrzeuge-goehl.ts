/** Importiert den Fahrzeugbestand des DRK OV Göhl: `npm run db:fahrzeuge` (mehrfach ausführbar). */
import { PrismaClient } from "@prisma/client";
import { importFleet } from "./fleet-goehl";

const db = new PrismaClient();
importFleet(db)
  .then((r) => console.log(`✔ Fahrzeugbestand: ${r.created} angelegt, ${r.completed} ergänzt, ${r.total} insgesamt in der Liste.`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
