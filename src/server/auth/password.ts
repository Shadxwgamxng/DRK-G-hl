import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, COST);
}

export function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/** Passwortrichtlinie: mind. 10 Zeichen, Buchstaben und Ziffern/Sonderzeichen. */
export function passwordProblems(pw: string): string | null {
  if (pw.length < 10) return "Das Passwort muss mindestens 10 Zeichen lang sein.";
  if (pw.length > 200) return "Das Passwort ist zu lang.";
  if (!/[A-Za-zÄÖÜäöüß]/.test(pw) || !/[^A-Za-zÄÖÜäöüß]/.test(pw))
    return "Das Passwort muss Buchstaben sowie Ziffern oder Sonderzeichen enthalten.";
  return null;
}
