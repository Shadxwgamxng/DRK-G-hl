# Architektur

## Überblick

```
Browser / PWA (React, Tailwind)          Service Worker: App-Shell-Cache, Seiten-Cache, Offline-Fallback
  │  Server Components (lesen)           IndexedDB: Offline-Entwürfe (Kontrolle, Mangel, Austragung)
  │  Server Actions (schreiben, CSRF-geschützt)
  │  /api/* (Upload, Dateien, Sync, Export, Cron, Health)
  ▼
Next.js Server (Node.js)
  src/server/auth        Sitzungen (SHA-256-Hash des Tokens in DB), Passwort-Hashing (bcrypt, Kosten 12)
  src/server/access.ts   Fahrzeug-Sichtbarkeit als Prisma-WHERE-Bedingung (DB-seitig gefiltert)
  src/server/services/*  Geschäftslogik – JEDE Funktion bekommt den „Actor“ und prüft Rechte selbst
  src/server/audit.ts    Änderungsprotokoll (alt/neu)
  ▼
PostgreSQL 16 (Prisma)   CHECK-Constraints, partieller Unique-Index, Unveränderlichkeits-Trigger
Private Dateiablage      UPLOAD_DIR außerhalb des Webroots, Zugriff nur über /api/files/:id
```

**Warum diese Wahl:** Next.js erlaubt Frontend und sichere Server-Logik in einem wartbaren TypeScript-Projekt; Server Actions sind per Origin-Prüfung gegen CSRF geschützt. PostgreSQL liefert Transaktionen, Zeilensperren und Trigger – zwingend für konsistente Bestände und revisionssichere Daten. Eine spätere native App (z. B. React Native/Capacitor) kann die vorhandenen `/api/sync/*`-Endpunkte und die Service-Schicht wiederverwenden.

## Projektstruktur

```
prisma/schema.prisma            Datenmodell
prisma/migrations/              SQL-Migration inkl. Trigger, CHECKs, partiellem Index
prisma/seed.ts / demo.ts        Basisdaten / Demo-Daten
src/app/(auth)/                 Login, Registrierung, Freigabe ausstehend, Rechtstexte
src/app/(app)/                  Geschützte Seiten (Layout prüft Sitzung serverseitig)
src/app/actions/                Server Actions (dünne Hülle um Services)
src/app/api/                    Upload, geschützte Dateien, Sync, Export, Cron, Health
src/components/                 Designsystem (ui.tsx, forms.tsx, status.tsx) + Fachkomponenten
src/server/                     Auth, Zugriff, Audit, Benachrichtigungen, Speicher, Services
src/lib/                        Formatierung (de-DE, Europe/Berlin), Labels, Offline-Speicher
tests/                          Integrationstests (Abnahmeszenarien)
public/sw.js, manifest          PWA
```

## Datenmodell (Kurzfassung)

| Bereich | Tabellen |
|---|---|
| Benutzer & Rechte | `User`, `Role`, `Permission`, `RolePermission`, `Session` |
| Fahrzeuge | `VehicleType`, `Vehicle`, `VehicleAssignment`, `VehicleStatusChange` |
| Kontrollen | `Checklist`, `ChecklistItem`, `VehicleCheck`, `VehicleCheckResult` (Momentaufnahme von Prüfpunkt-Texten) |
| Termine | `InspectionType`, `Inspection`, `MaintenanceRecord` |
| Material | `MaterialCategory`, `Material` (Katalog), `VehicleMaterialStock`, `MaterialBatch` |
| Lager | `Warehouse`, `StorageLocation`, `WarehouseStock`, `StockMovement` |
| Nachfüllung | `RefillRequest` |
| Mängel | `Defect`, `DefectComment` |
| Querschnitt | `Attachment`, `Notification`, `AuditLog`, `Setting` |

### Integritätsregeln in der Datenbank
- Bestände/Chargen nie negativ (`CHECK`).
- Eine Charge gehört genau einem Bestand – Fahrzeug **oder** Lager (`CHECK`).
- Höchstens **eine aktive** Nachfüllanforderung je Fahrzeugbestand (partieller Unique-Index) → keine Doppelmeldungen.
- `AuditLog`, `StockMovement`, `VehicleCheckResult` sind per Trigger unveränderlich; `VehicleCheck` erlaubt nur Nachträge (`amendments`).
- Ein Anhang ist höchstens einem Datensatz zugeordnet (`CHECK`).
- Idempotenz-Schlüssel `clientRef` (unique) für Offline-Synchronisation bei Kontrollen, Mängeln, Austragungen.

## Datenfluss Material

```
Austragen (Grund, Menge, ggf. Charge)
  └─ Transaktion: SELECT … FOR UPDATE auf Fahrzeugbestand
       ├─ Charge prüfen (gehört zur Position, Menge ausreichend) → nur DIESE Charge reduzieren
       ├─ Bestand reduzieren (bedingtes UPDATE, zusätzlich CHECK ≥ 0)
       ├─ StockMovement WRITE_OFF (unveränderlich) + Fotos
       ├─ AuditLog (alt/neu)
       └─ syncRefillRequest: Bedarf = Soll − Ist
            ├─ aktive Anforderung vorhanden → Menge angleichen (keine zweite Meldung)
            ├─ keine → neue Anforderung OPEN + Benachrichtigung Lager
            └─ Bedarf 0 → offene Anforderung automatisch storniert
Lager: Übernehmen (IN_PROGRESS) → Bereitstellen (PROVISION-Bewegungen aus Lagerplatz/Charge, Status PROVIDED)
Fahrzeug: Nachfüllung bestätigen (tatsächliche Menge) → REFILL ins Fahrzeug (FEFO über bereitgestellte Chargen),
          Restmenge RETURN ins Lager, Status REFILLED, Restbedarf → neue Anforderung → „Erledigt“ (DONE)
```
Erst die Bestätigung erhöht den Fahrzeugbestand. Sperrreihenfolge (Bestand vor Anforderung) verhindert Deadlocks.

## Datenfluss Mängel

`NEW → REVIEWED → IN_PROGRESS ⇄ WAITING_PARTS → RESOLVED (Maßnahmen + verantwortliche Person Pflicht) → CLOSED (Recht „defects.close“)`. Wiederaufnahme mit Begründung möglich. Kritische Mängel: Hervorhebung, Benachrichtigung, Warnung auf Fahrzeugseite. Der Fahrzeugstatus wird **nur manuell** geändert (`VehicleStatusChange` + Audit); Freigabe trotz unbehobener kritischer Mängel nur mit Begründung.

## Offline & Synchronisation

- Kontrolle, Mängelmeldung und Austragung werden immer als „Entwurf“ mit UUID (`clientRef`) aufgebaut. Online: sofort an `/api/sync/*`; offline oder Netzwerkfehler: IndexedDB.
- `SyncRunner` überträgt automatisch bei Verbindung; Fotos werden zuerst hochgeladen, die IDs im Entwurf gemerkt (keine Doppel-Uploads).
- Server ist idempotent (gleiche `clientRef` → vorhandener Datensatz). Validierungs-/Konfliktfehler (z. B. geänderte Checkliste, Bestand zwischenzeitlich verbraucht) werden **nicht** automatisch aufgelöst, sondern auf `/sync` als „Konflikt“ angezeigt (korrigieren, erneut senden oder verwerfen).
- Kopfzeile zeigt „Offline“ bzw. Anzahl nicht synchronisierter Vorgänge.
- Service Worker cacht nur App-Shell und wenige Seiten; niemals `/api/*` oder Dateien. Abmelden löscht Entwürfe und Seiten-Cache.

## Sicherheit

- Serverseitige Rechteprüfung in jeder Service-Funktion; Fahrzeugfilter als Datenbank-WHERE (fremde IDs → 404).
- Sitzungen: zufälliges 256-bit-Token, nur Hash in DB, httpOnly/SameSite=Lax/Secure, Ablauf konfigurierbar; Sperren/Rollenwechsel beendet Sitzungen.
- Login-Sperre nach 5 Fehlversuchen (15 min), gleiche Laufzeit für unbekannte Benutzer.
- CSRF: Server Actions (Origin-Prüfung durch Next.js), API-POSTs mit eigener Origin-Prüfung.
- SQL-Injection: ausschließlich Prisma bzw. parametrisierte `$queryRaw`-Templates.
- XSS: React-Escaping, strikte CSP, Dateien mit `nosniff` + `sandbox`-CSP; Dateityp per Magic Bytes.
- CSV-Export neutralisiert Formel-Injection.
- Keine Zugangsdaten im Code (`.env`, siehe `.env.example`).
