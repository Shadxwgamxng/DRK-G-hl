# KFZ-Warte – DRK Göhl

Web-App (installierbar als PWA) zur Verwaltung von Einsatzfahrzeugen, Fahrzeugkontrollen, HU-/Prüf- und Wartungsterminen, Fahrzeugmaterial mit Chargen und Verfallsdaten, zentralem Lager, Nachfülllisten und Mängeln.

| Thema | Dokument |
|---|---|
| Architektur, Datenmodell, Datenflüsse, Designentscheidungen | [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) |
| Benutzerrollen und Berechtigungen | [docs/ROLLEN.md](docs/ROLLEN.md) |
| Installation, Deployment, Cron, PWA (Android/iOS) | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Datenbank-Backup & Wiederherstellung, Löschkonzept | [docs/BACKUP.md](docs/BACKUP.md) |
| Abnahmetests und Teststatus | [docs/TESTS.md](docs/TESTS.md) |

## Screenshots

Bildschirmfotos im PC-Format (1920×1080, Demo-Daten) liegen in [docs/screenshots](docs/screenshots).

![Übersicht](docs/screenshots/01-dashboard.png)

## Technik

Next.js 15 (App Router, Server Components, Server Actions) · TypeScript · Tailwind CSS · PostgreSQL 16 · Prisma 6 · eigene serverseitige Sitzungen (bcrypt, httpOnly-Cookie) · Zod-Validierung · pdf-lib (PDF-Export) · Service Worker + IndexedDB (Offline-Entwürfe) · Vitest (Integrationstests gegen echte PostgreSQL-DB).

## Schnellstart (Entwicklung)

```bash
cp .env.example .env              # DATABASE_URL, SEED_ADMIN_* und CRON_SECRET anpassen
npm install
npx prisma migrate deploy         # Schema + Integritätsregeln (Trigger, CHECKs, partielle Indizes)
npm run db:seed                   # Rollen, Rechte, Stammdaten, Erst-Administrator
npm run dev                       # http://localhost:3000
```

Tests (benötigen eine **separate** Datenbank, deren Name `test` enthält, Standard `drk_kfz_test`):

```bash
TEST_DATABASE_URL="postgresql://drk:…@localhost:5432/drk_kfz_test" npm test
```

### Demo-Modus (optional)

Nur in einer **eigenen** Datenbank. Der Demo-Seed verweigert den Start, wenn bereits Produktivfahrzeuge existieren, und blendet in der Oberfläche einen gelben Hinweis „DEMO-MODUS“ ein.

```bash
DATABASE_URL=…/drk_kfz_demo npx prisma migrate deploy
DATABASE_URL=…/drk_kfz_demo npm run db:seed
DATABASE_URL=…/drk_kfz_demo DEMO_MODE=true npm run db:demo
# Anmeldung: demo.admin / demo.kfzwart / demo.helfer / demo.lager – Passwort „Demo-Passwort1“
```

## Getroffene Standardentscheidungen

- **Keine DRK-Logos/Rotkreuz-Embleme:** Es wurden keine Markendateien bereitgestellt, daher neutrales „KW“-Icon in DRK-Rot. Logo kann in `public/icons/` ersetzt werden.
- **Zugriff ohne Fahrzeugzuweisung = nichts sichtbar** (außer Administratoren mit „Alle Fahrzeuge sehen“).
- **Fahrzeugfreigabe nie automatisch:** Das Schließen eines Mangels ändert den Fahrzeugstatus nicht.
- **Prüfintervalle ohne gesetzliche Voreinstellungen;** je Termin konfigurierbar, Erinnerungen standardmäßig 30/14/7 Tage.
- **Medikamente** standardmäßig ausgeblendet; Freischaltung in den Einstellungen.
- **Checklisten-Prüfpunkte** sind als „Beispiel“ gekennzeichnet und je Fahrzeugtyp anpassbar.
- **Offline** nur Entwürfe (Kontrolle, Mangel, Austragen) + ausgewählte Seiten; Lager- und Nachfüllbuchungen nur online (Konsistenz). Beim Abmelden werden lokale Daten gelöscht.
- Datenschutz- und Nutzungsbedingungs-Seiten sind **Vorlagen** und vor Inbetriebnahme mit der/dem Datenschutzbeauftragten abzustimmen.
