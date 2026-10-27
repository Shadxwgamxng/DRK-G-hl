/**
 * Notfall: Passwort eines Benutzers auf der Server-Konsole neu setzen (z. B. wenn sich kein Admin mehr anmelden kann).
 * Docker:  docker compose exec app npx tsx scripts/reset-password.ts <benutzername>
 * Erzeugt ein Zufallspasswort, entsperrt das Konto, beendet alle Sitzungen und protokolliert den Vorgang.
 */
import { randomBytes } from "node:crypto";
import { db } from "../src/server/db";
import { audit } from "../src/server/audit";
import { hashPassword } from "../src/server/auth/password";

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error("Aufruf: npx tsx scripts/reset-password.ts <benutzername>");
  const user = await db.user.findUnique({ where: { username } });
  if (!user || user.anonymizedAt) throw new Error(`Benutzer „${username}“ nicht gefunden.`);
  const password = randomBytes(12).toString("base64url") + "-1";
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(null, { action: "user.password_reset_console", entityType: "User", entityId: user.id }, tx);
  });
  console.log(`✔ Neues Passwort für „${username}“: ${password}\n  Bitte nach der Anmeldung im Profil ändern.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
