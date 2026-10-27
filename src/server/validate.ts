import type { ZodTypeAny, z } from "zod";
import "@/lib/validation";
import { invalid } from "./errors";

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    throw invalid("Bitte die markierten Eingaben prüfen.", fieldErrors);
  }
  return r.data;
}
