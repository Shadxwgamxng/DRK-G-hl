# Abnahmetests

Automatisierte Integrationstests laufen mit Vitest gegen eine echte PostgreSQL-Testdatenbank (inkl. Triggern und Constraints): `npm test`. Stand: **47 Tests, alle bestanden.**

| Nr. | Szenario | Nachweis |
|---|---|---|
| 1 | Registrierter Benutzer sieht zunächst keine Fahrzeugdaten | `tests/access.test.ts` |
| 2 | Admin gibt frei und weist Fahrzeug zu | `tests/access.test.ts` |
| 3 | Benutzer sieht eigenes, aber kein fremdes Fahrzeug (URL-/ID-Manipulation → 404, auch Suche, Material, Mängel) | `tests/access.test.ts` |
| 4 | Admin verwaltet alle Fahrzeuge; Benutzer nicht | `tests/access.test.ts` |
| 5 | Kontrolle aktualisiert „letzte Kontrolle“; Revisionssicherheit per Trigger; Nachtrag protokolliert | `tests/checks-defects.test.ts` |
| 6 | Mangel mit Foto | `tests/checks-defects.test.ts`, Browser-E2E |
| 7 | Mangel bearbeiten → behoben → abgeschlossen; Fahrzeug wird nicht automatisch freigegeben | `tests/checks-defects.test.ts` |
| 8 | Abgelaufene Charge korrekt ausgetragen | `tests/materials.test.ts` |
| 9 | Austragen erzeugt/aktualisiert genau eine Nachfüllanforderung | `tests/materials.test.ts` |
| 10 | Lagerort in der Nachfüllliste | `tests/materials.test.ts` |
| 11 | Bestätigte Nachfüllung aktualisiert Fahrzeug- und Lagerbestand (inkl. Rückbuchung, Restbedarf) | `tests/materials.test.ts` |
| 12 | Chargen mit unterschiedlichem Verfall getrennt | `tests/materials.test.ts` |
| 13 | HU/Wartung: Erinnerungen 30/14/7 + überfällig, ohne Doppelmeldung | `tests/inspections-reports.test.ts` |
| 14 | Kein Abruf fremder Fotos/Dokumente; Dateityp per Signatur | `tests/access.test.ts` |
| 15 | Parallele Austragungen/Lagerentnahmen → konsistente Mengen | `tests/materials.test.ts` |
| 16 | Bedienung Android/iOS/Tablet/Desktop | Browser-E2E (Playwright, Chromium mit Geräteprofilen iPhone 13, Pixel 7, iPad, Desktop 1440 px) – Login, Kontrolle, Mangel mit Foto, Austragen, Navigation, Exporte, keine Konsolenfehler |
| – | Materialkatalog-Import (idempotent), Materialprüfung bei der Kontrolle (Abweichung, abgelaufen entnommen, neues Verfallsdatum, Gerät defekt → Mangel, Nachfüllliste, Revisionssicherheit, doppelte Synchronisation), BtM-Sichtbarkeit und Chargennummer-Pflicht | `tests/material-check.test.ts` |
| – | Schränke & Fächer: zwei Ebenen (auch per DB-Trigger), Material in mehreren Fächern, keine fremden Lagerorte, Löschen nur wenn leer, Check-Reihenfolge, Übernahme von Freitext-Altdaten, Beladung kopieren | `tests/compartments.test.ts` |
| 17 | Offline erfasste Vorgänge werden synchronisiert (idempotent, Konflikterkennung) | `tests/checks-defects.test.ts`, Browser-E2E (Offline-Mangel mit Foto → automatische Übertragung) |

**Grenzen:** Die Gerätetests liefen mit Chromium-Emulation. Echte Tests auf iOS-Safari (Installation, Kamera, Speicherverhalten) und Android-Geräten sind vor Inbetriebnahme manuell durchzuführen. Web-Push ist nicht implementiert (In-App + optional E-Mail).
