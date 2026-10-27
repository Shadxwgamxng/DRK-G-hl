import { addDays, berlinToday, daysUntil } from "./format";

/**
 * Fälligkeit der regelmäßigen Fahrzeugkontrolle.
 * - Einheit MONTHS (Standard, 1): Kontrolle 1 × pro Kalendermonat. Nach einer Kontrolle im Oktober ist die
 *   nächste bis zum 30.11. fällig. Ohne bisherige Kontrolle ist sie bis Ende des Monats fällig, in dem das
 *   Fahrzeug angelegt wurde (`since`).
 * - Einheit DAYS: rollierendes Intervall ab der letzten Kontrolle (ohne Kontrolle: ab `since` sofort fällig).
 */
export type CheckUnit = "DAYS" | "MONTHS" | "YEARS";

function endOfMonth(year: number, month0: number) {
  return new Date(Date.UTC(year, month0 + 1, 0));
}

export function nextCheckDue(lastCheckAt: Date | null | undefined, value: number, unit: CheckUnit, now = new Date(), since?: Date | null): Date {
  const start = berlinToday(since && since < now ? since : now);
  if (unit === "DAYS") return lastCheckAt ? addDays(berlinToday(lastCheckAt), value) : start;
  const months = unit === "YEARS" ? value * 12 : value;
  if (!lastCheckAt) return endOfMonth(start.getUTCFullYear(), start.getUTCMonth());
  const last = berlinToday(lastCheckAt);
  return endOfMonth(last.getUTCFullYear(), last.getUTCMonth() + months);
}

export type CheckState = "overdue" | "due" | "ok";

/** Vorwarnzeitraum: bei Monatsintervallen der Rest des laufenden Monats, bei Tagesintervallen 1 Tag. */
export function checkWarnDays(unit: CheckUnit, now = new Date()) {
  if (unit === "DAYS") return 1;
  const today = berlinToday(now);
  return daysUntil(endOfMonth(today.getUTCFullYear(), today.getUTCMonth()), now)!;
}

export function checkState(due: Date, unit: CheckUnit, now = new Date()): { state: CheckState; days: number } {
  const days = daysUntil(due, now)!;
  return { state: days < 0 ? "overdue" : days <= checkWarnDays(unit, now) ? "due" : "ok", days };
}

export function checkIntervalLabel(value: number, unit: CheckUnit) {
  if (unit === "MONTHS") return value === 1 ? "1 × pro Kalendermonat" : `alle ${value} Kalendermonate`;
  if (unit === "YEARS") return value === 1 ? "1 × pro Jahr" : `alle ${value} Jahre`;
  return value === 1 ? "täglich" : `alle ${value} Tage`;
}

const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export function monthName(d: Date) {
  return `${MONTHS_DE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
