// Zentrale Rechte-Definition. Die Rechte werden serverseitig in jeder Service-Funktion geprüft.

export const PERMISSIONS = {
  "vehicles.view_all": "Alle Fahrzeuge sehen (ohne Zuweisung)",
  "vehicles.manage": "Fahrzeuge anlegen, bearbeiten und archivieren",
  "vehicles.set_status": "Einsatzstatus eines Fahrzeugs ändern / Fahrzeug freigeben",
  "checks.perform": "Fahrzeugkontrollen durchführen",
  "checks.amend": "Nachträge zu abgeschlossenen Kontrollen erfassen",
  "checklists.manage": "Checklisten konfigurieren",
  "inspections.view": "Prüf- und Wartungstermine einsehen",
  "inspections.complete": "Prüfungen/Wartungen als durchgeführt dokumentieren",
  "inspections.manage": "Prüf- und Wartungstermine anlegen und bearbeiten",
  "materials.view": "Materialbestände einsehen",
  "materials.report": "Material austragen / fehlendes Material melden",
  "materials.manage": "Materialbestände der Fahrzeuge verwalten (Soll, Chargen, Korrekturen)",
  "materials.catalog": "Materialkatalog und Kategorien pflegen",
  "refills.confirm": "Nachfüllung im Fahrzeug bestätigen",
  "refills.process": "Nachfüllanforderungen bearbeiten und Material bereitstellen",
  "warehouse.view": "Zentrales Lager einsehen",
  "warehouse.manage": "Lagerbestände, Lagerorte und Zugänge verwalten",
  "defects.report": "Mängel melden",
  "defects.manage": "Mängel bearbeiten, zuweisen und beheben",
  "defects.close": "Mängel kontrolliert abschließen",
  "attachments.upload": "Fotos und Dokumente hochladen",
  "reports.view": "Berichte ansehen und exportieren",
  "users.manage": "Benutzer freigeben und verwalten",
  "roles.manage": "Rollen und Berechtigungen verwalten",
  "settings.manage": "Systemeinstellungen verwalten",
  "audit.view": "Änderungsprotokoll einsehen",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export const SYSTEM_ROLES: Record<string, { name: string; description: string; permissions: PermissionKey[] }> = {
  ADMIN: {
    name: "Administrator",
    description: "Vollzugriff auf alle Fahrzeuge, Benutzer, Einstellungen und Protokolle.",
    permissions: ALL_PERMISSIONS,
  },
  FLEET_MANAGER: {
    name: "Fahrzeugverantwortlicher / KFZ-Wart",
    description: "Zugriff auf zugewiesene Fahrzeuge: Kontrollen, Mängel, Material, Termine.",
    permissions: [
      "vehicles.set_status",
      "checks.perform",
      "inspections.view",
      "inspections.complete",
      "materials.view",
      "materials.report",
      "materials.manage",
      "refills.confirm",
      "defects.report",
      "defects.manage",
      "defects.close",
      "attachments.upload",
      "reports.view",
    ],
  },
  WAREHOUSE: {
    name: "Lagerverwaltung",
    description: "Zentrales Lager und Bearbeitung von Nachfüllanforderungen (zugewiesene Fahrzeuge).",
    permissions: [
      "materials.view",
      "materials.report",
      "materials.catalog",
      "refills.process",
      "refills.confirm",
      "warehouse.view",
      "warehouse.manage",
      "attachments.upload",
      "reports.view",
    ],
  },
  USER: {
    name: "Regulärer Benutzer",
    description: "Nur zugewiesenes Fahrzeug: Daten einsehen, Mängel und Material melden.",
    permissions: [
      "checks.perform", // zusätzlich nur, wenn beim Benutzer „Kontrollen freigeschaltet“ aktiv ist
      "inspections.view",
      "materials.view",
      "materials.report",
      "defects.report",
      "attachments.upload",
    ],
  },
};
