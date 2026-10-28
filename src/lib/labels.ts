export const USER_STATUS: Record<string, string> = {
  PENDING: "Wartet auf Freigabe",
  ACTIVE: "Aktiv",
  REJECTED: "Abgelehnt",
  DISABLED: "Deaktiviert",
  LOCKED: "Gesperrt",
};

export const VEHICLE_STATUS: Record<string, string> = {
  READY: "Einsatzbereit",
  LIMITED: "Eingeschränkt einsatzbereit",
  NOT_READY: "Nicht einsatzbereit",
  OUT_OF_SERVICE: "Außer Dienst",
};

export const CHECK_TYPE: Record<string, string> = {
  ROUTINE: "Monatskontrolle (regelmäßig)",
  SHIFT_START: "Dienstübernahme",
  AFTER_MISSION: "Nach Einsatz",
  EXTENDED: "Erweiterte Kontrolle",
  OTHER: "Sonstige",
};

export const CHECK_RESULT: Record<string, string> = {
  OK: "In Ordnung",
  DEFECT: "Mangel festgestellt",
  NOT_APPLICABLE: "Nicht zutreffend",
};

export const CHECK_OUTCOME: Record<string, string> = {
  OK: "Ohne Befund",
  DEFECTS: "Mängel festgestellt",
};

export const INTERVAL_UNIT: Record<string, string> = { DAYS: "Tage", MONTHS: "Monate", YEARS: "Jahre" };

export const DEFECT_CATEGORY: Record<string, string> = {
  VEHICLE_TECH: "Fahrzeugtechnik",
  BODY: "Karosserie und Lack",
  ELECTRICAL: "Beleuchtung und Elektrik",
  TIRES: "Reifen",
  MEDICAL_DEVICES: "Medizinische Geräte",
  MATERIAL: "Material",
  HYGIENE: "Hygiene",
  EQUIPMENT: "Ausstattung",
  OTHER: "Sonstiges",
};

export const DEFECT_SEVERITY: Record<string, string> = {
  LOW: "Niedrig",
  MEDIUM: "Mittel",
  HIGH: "Hoch",
  CRITICAL: "Kritisch",
};

export const DEFECT_STATUS: Record<string, string> = {
  NEW: "Neu gemeldet",
  REVIEWED: "Geprüft",
  IN_PROGRESS: "In Bearbeitung",
  WAITING_PARTS: "Wartet auf Ersatzteil",
  RESOLVED: "Behoben",
  CLOSED: "Kontrolliert und abgeschlossen",
};

export const OPEN_DEFECT_STATUSES = ["NEW", "REVIEWED", "IN_PROGRESS", "WAITING_PARTS", "RESOLVED"] as const;

export const MOVEMENT_TYPE: Record<string, string> = {
  RECEIPT: "Zugang",
  ISSUE: "Entnahme",
  WRITE_OFF: "Austragung",
  PROVISION: "Bereitstellung",
  REFILL: "Nachfüllung",
  RETURN: "Rückgabe",
  CORRECTION: "Korrektur",
};

export const MOVEMENT_REASON: Record<string, string> = {
  EXPIRED: "Abgelaufen",
  USED: "Verbraucht",
  DAMAGED: "Beschädigt",
  LOST: "Verloren / fehlt",
  OTHER: "Sonstiger Grund",
};

export const REFILL_STATUS: Record<string, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  PROVIDED: "Material bereitgestellt",
  REFILLED: "Nachgefüllt",
  DONE: "Erledigt",
  CANCELLED: "Storniert",
};

export const ACTIVE_REFILL_STATUSES = ["OPEN", "IN_PROGRESS", "PROVIDED"] as const;

export const AUDIT_ACTION: Record<string, string> = {
  "user.register": "Registrierung",
  "user.approve": "Benutzer freigegeben",
  "user.reject": "Registrierung abgelehnt",
  "user.status": "Benutzerstatus geändert",
  "user.update": "Benutzer bearbeitet",
  "user.role": "Rolle geändert",
  "user.assign": "Fahrzeugzuweisung geändert",
  "user.anonymize": "Benutzer anonymisiert (DSGVO)",
  "user.password": "Passwort geändert",
  "user.login": "Anmeldung",
  "role.permissions": "Berechtigungen geändert",
  "vehicle.create": "Fahrzeug angelegt",
  "vehicle.update": "Fahrzeug bearbeitet",
  "vehicle.archive": "Fahrzeug archiviert",
  "vehicle.restore": "Fahrzeug reaktiviert",
  "vehicle.status": "Einsatzstatus geändert",
  "check.complete": "Fahrzeugkontrolle abgeschlossen",
  "check.amend": "Nachtrag zur Kontrolle",
  "inspection.create": "Termin angelegt",
  "inspection.update": "Termin geändert",
  "inspection.complete": "Prüfung/Wartung durchgeführt",
  "inspection.deactivate": "Termin deaktiviert",
  "stock.create": "Materialposition angelegt",
  "stock.update": "Materialposition geändert",
  "stock.writeoff": "Material ausgetragen",
  "stock.correction": "Bestandskorrektur",
  "stock.batch_add": "Charge eingebucht",
  "warehouse.receipt": "Lagerzugang",
  "warehouse.issue": "Lagerentnahme",
  "refill.create": "Nachfüllanforderung erstellt",
  "refill.update_quantity": "Nachfüllmenge aktualisiert",
  "refill.status": "Nachfüllstatus geändert",
  "refill.provide": "Material bereitgestellt",
  "refill.confirm": "Nachfüllung bestätigt",
  "refill.cancel": "Nachfüllanforderung storniert",
  "defect.create": "Mangel gemeldet",
  "defect.update": "Mangel bearbeitet",
  "defect.status": "Mangelstatus geändert",
  "defect.close": "Mangel abgeschlossen",
  "attachment.upload": "Anhang hochgeladen",
  "attachment.delete": "Anhang gelöscht",
  "settings.update": "Einstellungen geändert",
  "checklist.update": "Checkliste geändert",
  "master.update": "Stammdaten geändert",
};

export const CHECK_MATERIAL_STATUS: Record<string, string> = {
  OK: "Stimmt",
  DEVIATION: "Abweichung gebucht",
  MISSING: "Fehlt",
  DEFECT: "Defekt (Mangel gemeldet)",
};

export const COMPARTMENT_KIND: Record<string, string> = {
  CABINET: "Schrank",
  DRAWER: "Auszug / Schublade",
  BACKPACK: "Rucksack",
  BAG: "Tasche / Koffer",
  BOX: "Kiste / Box",
  SHELF: "Regal / Ablage",
  COMPARTMENT: "Fach",
  OTHER: "Sonstiges",
};
