/**
 * Fahrzeugbestand DRK Ortsverein Göhl e.V. (Bereitschaft)
 * Quelle: Angaben des Ortsvereins + https://bos-fahrzeuge.info/wachen/30215/DRK_OV_Goehl/einsatzfahrzeuge
 * (Kennzeichen, Klassifizierung, Hersteller – Stand 27.10.2026). Fehlende Angaben bitte in der App ergänzen.
 * Fahrzeugkontrolle für alle: 1 × pro Kalendermonat (Standard des Datenmodells).
 */
import type { PrismaClient } from "@prisma/client";

export type FleetEntry = {
  internalNumber: string;
  name: string;
  radioCallSign?: string;
  type: string;
  typeDescription: string;
  licensePlate?: string;
  manufacturer?: string;
  remarks?: string;
};

const SRC = "Stammdaten aus bos-fahrzeuge.info (Stand 27.10.2026) – bitte prüfen und ergänzen (Modell, Baujahr, Erstzulassung, Kilometerstand).";

export const FLEET_GOEHL: FleetEntry[] = [
  { internalNumber: "42/83-01", name: "RTW T1", radioCallSign: "Rotkreuz Ostholstein 42/83-01", type: "RTW", typeDescription: "Rettungswagen", remarks: "Nicht auf bos-fahrzeuge.info gelistet – Kennzeichen, Hersteller und Modell bitte nachtragen." },
  { internalNumber: "42/89-01", name: "First Responder", radioCallSign: "Rotkreuz Ostholstein 42/89-01", type: "First Responder", typeDescription: "First-Responder / Helfer vor Ort", licensePlate: "OH-FR 42", manufacturer: "Volkswagen", remarks: SRC },
  { internalNumber: "42/90-01", name: "N-KTW 1", radioCallSign: "Rotkreuz Ostholstein 42/90-01", type: "N-KTW", typeDescription: "Notfallkrankentransportwagen", licensePlate: "OH-KS 8002", manufacturer: "Mercedes-Benz", remarks: SRC },
  { internalNumber: "42/90-02", name: "N-KTW 2", radioCallSign: "Rotkreuz Ostholstein 42/90-02", type: "N-KTW", typeDescription: "Notfallkrankentransportwagen", licensePlate: "OH-KS 8000", manufacturer: "Mercedes-Benz", remarks: SRC },
  { internalNumber: "42/92-01", name: "KTW-4", radioCallSign: "Rotkreuz Ostholstein 42/92-01", type: "KTW-4", typeDescription: "Krankentransportwagen 4-Tragen", licensePlate: "OH-5030", manufacturer: "Volkswagen", remarks: SRC },
  { internalNumber: "42/95-01", name: "GW-San", radioCallSign: "Rotkreuz Ostholstein 42/95-01", type: "GW-San", typeDescription: "Gerätewagen Sanität", licensePlate: "OH-KS 8005", manufacturer: "MAN", remarks: SRC },
  { internalNumber: "42/98-01", name: "GW-Bt", radioCallSign: "Rotkreuz Ostholstein 42/98-01", type: "GW-Bt", typeDescription: "Gerätewagen Betreuung", licensePlate: "OH-KS 5007", manufacturer: "MAN", remarks: SRC },
  { internalNumber: "42/99-01", name: "MTW", radioCallSign: "Rotkreuz Ostholstein 42/99-01", type: "MTW", typeDescription: "Mannschaftstransportwagen", licensePlate: "OH-KS 5012", manufacturer: "Ford", remarks: SRC },
  { internalNumber: "FKH-01", name: "Feldkochherd", type: "Feldkochherd", typeDescription: "Feldkochherd (Verpflegung)", remarks: "Kennzeichen (falls zugelassen), Hersteller und Typ bitte nachtragen." },
  {
    internalNumber: "ANH-VPF-01",
    name: "Verpflegungsanhänger",
    type: "Anhänger",
    typeDescription: "Anhänger",
    remarks: "Kennzeichen bitte nachtragen. Hinweis: Auf bos-fahrzeuge.info ist ein „Betreuungs- und Verpflegungs-AnH“ (OH-RK 4001) als außer Dienst geführt – prüfen, ob identisch.",
  },
  {
    internalNumber: "ANH-LOG-01",
    name: "Logistikanhänger",
    type: "Anhänger",
    typeDescription: "Anhänger",
    remarks: "Kennzeichen bitte nachtragen. Hinweis: Auf bos-fahrzeuge.info ist ein „Material-Anhänger“ (Böckmann, KI-AW 22) als außer Dienst geführt – prüfen, ob identisch.",
  },
];

/**
 * Legt fehlende Fahrzeuge an. Bestehende Fahrzeuge (gleiche interne Nummer) werden nicht überschrieben;
 * nur leere Felder werden ergänzt. Jede Änderung wird im Änderungsprotokoll vermerkt.
 */
export async function importFleet(db: PrismaClient, fleet = FLEET_GOEHL) {
  let created = 0;
  let completed = 0;
  for (const f of fleet) {
    const type = await db.vehicleType.upsert({ where: { name: f.type }, create: { name: f.type, description: f.typeDescription }, update: {} });
    const existing = await db.vehicle.findUnique({ where: { internalNumber: f.internalNumber } });
    if (!existing) {
      let licensePlate = f.licensePlate;
      if (licensePlate && (await db.vehicle.findUnique({ where: { licensePlate } }))) {
        console.warn(`⚠ Kennzeichen ${licensePlate} ist bereits einem anderen Fahrzeug zugeordnet – ${f.name} wird ohne Kennzeichen angelegt.`);
        licensePlate = undefined;
      }
      const v = await db.vehicle.create({
        data: { name: f.name, internalNumber: f.internalNumber, radioCallSign: f.radioCallSign, licensePlate, manufacturer: f.manufacturer, typeId: type.id, remarks: f.remarks, location: "DRK OV Göhl" },
      });
      await db.auditLog.create({ data: { action: "vehicle.create", entityType: "Vehicle", entityId: v.id, vehicleId: v.id, newValues: { ...f, quelle: "Import Fahrzeugbestand" } } });
      created++;
    } else {
      const patch: Record<string, unknown> = {};
      if (!existing.radioCallSign && f.radioCallSign) patch.radioCallSign = f.radioCallSign;
      if (!existing.licensePlate && f.licensePlate && !(await db.vehicle.findUnique({ where: { licensePlate: f.licensePlate } }))) patch.licensePlate = f.licensePlate;
      if (!existing.manufacturer && f.manufacturer) patch.manufacturer = f.manufacturer;
      if (Object.keys(patch).length) {
        await db.vehicle.update({ where: { id: existing.id }, data: patch });
        await db.auditLog.create({ data: { action: "vehicle.update", entityType: "Vehicle", entityId: existing.id, vehicleId: existing.id, newValues: { ...patch, quelle: "Import Fahrzeugbestand" } as object } });
        completed++;
      }
    }
  }
  return { created, completed, total: fleet.length };
}
