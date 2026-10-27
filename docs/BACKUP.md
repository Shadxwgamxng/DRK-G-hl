# Backup, Wiederherstellung & Löschkonzept

Zu sichern sind **zwei** Dinge: die PostgreSQL-Datenbank und das Upload-Verzeichnis (`UPLOAD_DIR`). Beide gehören zusammen (Anhänge werden über `storageKey` referenziert).

## Tägliches Backup (Beispiel)
```bash
#!/bin/sh
set -e
STAMP=$(date +%F)
pg_dump --format=custom --no-owner "$DATABASE_URL" > /backup/drk_kfz_$STAMP.dump
tar -czf /backup/uploads_$STAMP.tar.gz -C "$UPLOAD_DIR" .
find /backup -mtime +30 -delete      # Aufbewahrung 30 Tage (an Vorgaben anpassen)
```
Docker: `docker compose exec -T db pg_dump -U drk -Fc drk_kfz > drk_kfz_$(date +%F).dump` und das Volume `uploads` sichern.

Backups verschlüsselt und räumlich getrennt ablegen (z. B. `gpg`/`restic`). Wiederherstellung mindestens halbjährlich testen.

## Wiederherstellung
```bash
# Anwendung stoppen
createdb drk_kfz_restore
pg_restore --no-owner -d drk_kfz_restore drk_kfz_2026-10-27.dump
tar -xzf uploads_2026-10-27.tar.gz -C "$UPLOAD_DIR"
# DATABASE_URL auf die wiederhergestellte DB zeigen lassen, Anwendung starten, Stichprobe prüfen
```
Hinweis: Die Unveränderlichkeits-Trigger werden mit dem Dump wiederhergestellt; `pg_restore` arbeitet mit `INSERT`/`COPY` und ist davon nicht betroffen.

## Löschkonzept (DSGVO)
| Daten | Umgang |
|---|---|
| Benutzerkonto | Anonymisierung durch Admin (Name, E-Mail, Benutzername, Passwort entfernt; Sitzungen, Zuweisungen, Benachrichtigungen gelöscht) |
| Sitzungen | Automatisch nach Ablauf (Erinnerungslauf) bzw. beim Abmelden |
| Nicht zugeordnete Uploads | Automatisch nach 48 h |
| Lokale Gerätedaten | Beim Abmelden gelöscht (Entwürfe, Seiten-Cache) |
| Kontrollen, Mängel, Bewegungen, Protokoll | Revisionssicher; Aufbewahrungsfrist durch den Verantwortlichen festlegen; Löschung nach Fristablauf nur per dokumentiertem DB-Wartungsskript durch Administrator der Datenbank |
