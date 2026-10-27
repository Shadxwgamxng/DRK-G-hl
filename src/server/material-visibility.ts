import type { Prisma } from "@prisma/client";
import type { Actor } from "./actor";
import { can } from "./actor";

/** Sichtbare Materialien: Medikamente nur, wenn freigeschaltet; Betäubungsmittel nur mit eigenem Recht. */
export function materialVisibility(actor: Actor, medicationsEnabled: boolean): Prisma.MaterialWhereInput {
  return {
    ...(medicationsEnabled ? {} : { category: { isMedication: false } }),
    ...(can(actor, "materials.btm") ? {} : { isNarcotic: false }),
  };
}
