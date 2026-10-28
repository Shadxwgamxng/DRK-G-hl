/** Unscharfe Suche für Auswahlfelder (ohne Groß-/Kleinschreibung und Umlaute). */

// Gängige Abkürzungen aus dem Rettungsdienst, damit z. B. „vvk 18“ die Venenverweilkanüle findet
export const ABBREVIATIONS: Record<string, string[]> = {
  vvk: ["venenverweilkanule"],
  bz: ["blutzucker"],
  et: ["endotrachealtubus"],
  lt: ["larynxtubus"],
  io: ["intraossar", "io"],
  o2: ["sauerstoff"],
  spo2: ["spo₂", "spo2"],
  hws: ["hws"],
  btm: ["btm", "morphin"],
  nacl: ["nacl"],
  mns: ["mund-nasen-schutz"],
  ffp: ["ffp"],
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");

/** Alle Suchwörter müssen vorkommen (in beliebiger Reihenfolge); Abkürzungen werden aufgelöst. */
export function matches(text: string, query: string) {
  const hay = normalize(text);
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w) || (ABBREVIATIONS[w] ?? []).some((alt) => hay.includes(alt)));
}
