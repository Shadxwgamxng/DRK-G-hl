# Benutzerrollen und Berechtigungen

Rollen bestehen aus einzelnen Rechten (Tabelle `Permission`) und können unter **Administration → Rollen & Rechte** angepasst oder ergänzt werden. Alle Rechte werden serverseitig geprüft. Fahrzeugbezogene Rechte gelten – außer bei `vehicles.view_all` – nur für **zugewiesene** Fahrzeuge.

| Recht | Administrator | KFZ-Wart | Lager | Regulärer Benutzer |
|---|:-:|:-:|:-:|:-:|
| vehicles.view_all – alle Fahrzeuge sehen | ✔ | | | |
| vehicles.manage – Fahrzeuge anlegen/bearbeiten/archivieren | ✔ | | | |
| vehicles.set_status – Einsatzstatus / Freigabe | ✔ | ✔ | | |
| checks.perform – Fahrzeugkontrollen | ✔ | ✔ | | ✔¹ |
| checks.amend – Nachträge zu Kontrollen | ✔ | | | |
| checklists.manage | ✔ | | | |
| inspections.view / .complete / .manage | ✔/✔/✔ | ✔/✔/– | | ✔/–/– |
| materials.view / .report (austragen, fehlend melden) | ✔ | ✔ | ✔ | ✔ |
| materials.manage – Soll, Chargen, Inventur | ✔ | ✔ | | |
| materials.catalog – Katalog & Kategorien | ✔ | | ✔ | |
| materials.btm – Betäubungsmittel einsehen, prüfen, buchen | ✔ | ✔ | | |
| refills.confirm – Nachfüllung bestätigen | ✔ | ✔ | ✔ | |
| refills.process – Lager: übernehmen, bereitstellen, stornieren | ✔ | | ✔ | |
| warehouse.view / .manage | ✔ | | ✔ | |
| defects.report | ✔ | ✔ | | ✔ |
| defects.manage – bearbeiten, zuweisen, beheben | ✔ | ✔ | | |
| defects.close – Abschlusskontrolle | ✔ | ✔ | | |
| attachments.upload | ✔ | ✔ | ✔ | ✔² |
| reports.view – Berichte/Exporte | ✔ | ✔ | ✔ | |
| users.manage, roles.manage, settings.manage, audit.view | ✔ | | | |

¹ Nur wenn beim Benutzer „Darf Fahrzeugkontrollen durchführen“ aktiviert ist.
² Reguläre Benutzer dürfen Fotos nur zu **eigenen** Mängelmeldungen ergänzen.

## Lebenszyklus eines Kontos
1. Registrierung → Status **Wartet auf Freigabe** (Login möglich, aber keinerlei Fahrzeugdaten).
2. Administrator gibt frei (Rolle wählen) und weist ein Fahrzeug zu (mehrere nur, wenn global **und** beim Benutzer aktiviert).
3. Aktivieren/Deaktivieren/Sperren jederzeit; Sperren beendet alle Sitzungen sofort. Der letzte aktive Administrator kann nicht gesperrt oder herabgestuft werden.
4. DSGVO: „Anonymisieren“ entfernt personenbezogene Daten; Kontrollen, Mängel und Protokoll bleiben ohne Personenbezug erhalten.

Das Änderungsprotokoll kann von niemandem – auch nicht von Administratoren – verändert oder gelöscht werden (Datenbank-Trigger).
