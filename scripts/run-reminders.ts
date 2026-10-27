import { runReminders } from "../src/server/services/reminders";
import { db } from "../src/server/db";

runReminders()
  .then((r) => console.log("Erinnerungslauf abgeschlossen:", r))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
