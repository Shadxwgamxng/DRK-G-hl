import { z } from "zod";

// Deutschsprachige Standard-Fehlermeldungen
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") return { message: "Pflichtfeld" };
      return { message: "Ungültiger Wert" };
    case z.ZodIssueCode.too_small:
      if (issue.type === "string") return { message: issue.minimum === 1 ? "Pflichtfeld" : `Mindestens ${issue.minimum} Zeichen` };
      if (issue.type === "number") return { message: `Mindestens ${issue.minimum}` };
      if (issue.type === "array") return { message: `Mindestens ${issue.minimum} Eintrag/Einträge` };
      return { message: "Zu klein" };
    case z.ZodIssueCode.too_big:
      if (issue.type === "string") return { message: `Höchstens ${issue.maximum} Zeichen` };
      if (issue.type === "number") return { message: `Höchstens ${issue.maximum}` };
      return { message: "Zu groß" };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "Ungültige E-Mail-Adresse" };
      return { message: "Ungültiges Format" };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: "Bitte einen gültigen Wert auswählen" };
    case z.ZodIssueCode.invalid_date:
      return { message: "Ungültiges Datum" };
    default:
      return { message: ctx.defaultError };
  }
});

export { z };

/** Leere Formularwerte → undefined */
const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);

export const optText = (max = 2000) =>
  z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim()) : emptyToUndef(v)), z.string().max(max).optional());
export const reqText = (max = 200) => z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(max));
export const optInt = (min = 0, max = 10_000_000) =>
  z.preprocess((v) => (emptyToUndef(v) === undefined ? undefined : Number(v)), z.number().int("Ganze Zahl erforderlich").min(min).max(max).optional());
export const reqInt = (min = 0, max = 10_000_000) =>
  z.preprocess((v) => (emptyToUndef(v) === undefined ? undefined : Number(v)), z.number({ required_error: "Pflichtfeld" }).int("Ganze Zahl erforderlich").min(min).max(max));
export const optDate = () =>
  z.preprocess((v) => (emptyToUndef(v) === undefined ? undefined : new Date(String(v))), z.date().optional());
export const reqDate = () => z.preprocess((v) => (emptyToUndef(v) === undefined ? undefined : new Date(String(v))), z.date({ required_error: "Pflichtfeld" }));
export const optId = () => z.preprocess(emptyToUndef, z.string().max(64).optional());
export const checkbox = () => z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean());
export const optDecimal = () =>
  z.preprocess(
    (v) => (emptyToUndef(v) === undefined ? undefined : Number(String(v).replace(",", "."))),
    z.number().min(0).max(10_000_000).optional(),
  );
