import { db, type Tx } from "./db";

export type AppSettings = {
  /** Medikamenten-Kategorien sind nur nutzbar, wenn ausdrücklich freigeschaltet. */
  medicationsEnabled: boolean;
  /** Ab wie vielen Tagen vor Verfall ein Material als „bald ablaufend“ gilt. */
  expiryWarningDays: number;
  /** E-Mail-Benachrichtigungen global aktiviert (zusätzlich SMTP-Konfiguration erforderlich). */
  emailNotificationsEnabled: boolean;
  /** Mehrfache Fahrzeugzuweisung grundsätzlich erlauben (zusätzlich pro Benutzer). */
  multiVehicleAssignmentEnabled: boolean;
  /** Organisationsname für Berichte. */
  organizationName: string;
  /** Wird ausschließlich vom Demo-Seed gesetzt – zeigt einen deutlichen Hinweis in der Oberfläche. */
  demoMode: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  medicationsEnabled: false,
  expiryWarningDays: 30,
  emailNotificationsEnabled: false,
  multiVehicleAssignmentEnabled: true,
  organizationName: "DRK Göhl – KFZ-Warte",
  demoMode: false,
};

export async function getSettings(tx: Tx = db): Promise<AppSettings> {
  const rows = await tx.setting.findMany();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) s[r.key] = r.value;
  return s as AppSettings;
}
