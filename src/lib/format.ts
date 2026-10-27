const TZ = "Europe/Berlin";

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});
const numFmt = new Intl.NumberFormat("de-DE");
const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

type D = Date | string | null | undefined;
const toDate = (d: D) => (d == null ? null : d instanceof Date ? d : new Date(d));

export function fmtDate(d: D, empty = "–") {
  const x = toDate(d);
  return x ? dateFmt.format(x) : empty;
}
export function fmtDateTime(d: D, empty = "–") {
  const x = toDate(d);
  return x ? dateTimeFmt.format(x) : empty;
}
export function fmtNumber(n: number | null | undefined, empty = "–") {
  return n == null ? empty : numFmt.format(n);
}
export function fmtEuro(n: number | string | { toString(): string } | null | undefined, empty = "–") {
  if (n == null) return empty;
  return eurFmt.format(Number(n.toString()));
}

/** Kalendertag in Berlin als UTC-Mitternacht (passend zu @db.Date-Feldern). */
export function berlinToday(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${parts}T00:00:00.000Z`);
}

export function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

export function addInterval(d: Date, value: number, unit: "DAYS" | "MONTHS" | "YEARS") {
  const x = new Date(d);
  if (unit === "DAYS") x.setUTCDate(x.getUTCDate() + value);
  if (unit === "MONTHS") x.setUTCMonth(x.getUTCMonth() + value);
  if (unit === "YEARS") x.setUTCFullYear(x.getUTCFullYear() + value);
  return x;
}

/** Tage bis zum Datum (negativ = überfällig), bezogen auf den Berliner Kalendertag. */
export function daysUntil(d: D, now = new Date()): number | null {
  const x = toDate(d);
  if (!x) return null;
  const day = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
  return Math.round((day.getTime() - berlinToday(now).getTime()) / 86400000);
}

/** yyyy-mm-dd für <input type="date"> */
export function toDateInput(d: D) {
  const x = toDate(d);
  return x ? x.toISOString().slice(0, 10) : "";
}

export function relativeDays(n: number | null) {
  if (n == null) return "";
  if (n === 0) return "heute";
  if (n === 1) return "morgen";
  if (n === -1) return "seit gestern";
  return n > 0 ? `in ${n} Tagen` : `seit ${-n} Tagen`;
}
