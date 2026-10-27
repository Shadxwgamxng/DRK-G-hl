# Installation auf einem Root-Server (Produktivbetrieb, ohne Demo)

Diese Anleitung richtet die KFZ-Warte mit **HTTPS, Datenbank, täglichen Erinnerungen und Backups** auf einem eigenen Server ein. Das Produktiv-Paket enthält **keinen Demo-Modus** und keine Beispieldaten.

## Was du brauchst
| | |
|---|---|
| Server | Root-Server/vServer mit **Ubuntu 22.04/24.04 oder Debian 12**, mind. 2 GB RAM (4 GB empfohlen), 20 GB Speicher |
| Zugang | SSH-Zugang als `root` (alle Befehle als root ausführen; `sudo` wird nicht benötigt) |
| Domain | Eine (Sub-)Domain, z. B. `kfz.drk-goehl.de`, deren **A-Eintrag (und ggf. AAAA) auf die IP des Servers zeigt** |
| Ports | 80 und 443 müssen aus dem Internet erreichbar sein (Firewall des Hosters prüfen) |

> HTTPS ist Pflicht (App-Installation auf dem Handy, Kamera, sichere Anmeldung). Das Zertifikat wird automatisch über Let's Encrypt erstellt und verlängert.

## 1. DNS einrichten
Beim Domain-Anbieter einen **A-Record** anlegen: `kfz` → `IP-Adresse des Servers`.
Prüfen (am eigenen PC): `ping kfz.drk-goehl.de` muss die Server-IP zeigen. Das kann bis zu einer Stunde dauern.

## 2. Paket auf den Server kopieren
Am eigenen PC (Windows: PowerShell, macOS/Linux: Terminal):
```bash
scp drk-kfz-warte.zip root@SERVER-IP:/opt/
```
Alternativ mit WinSCP/FileZilla nach `/opt/` hochladen.

## 3. Entpacken und installieren
Per SSH auf den Server (`ssh root@SERVER-IP`, z. B. in Tabby/PuTTY). Die Befehle laufen **auf dem Server**, nicht in der lokalen Windows-Konsole. Als `root` ist kein `sudo` nötig; bist du als anderer Benutzer angemeldet, zuerst `su -` eingeben.
```bash
apt-get update && apt-get install -y unzip
cd /opt && unzip drk-kfz-warte.zip
cd /opt/drk-kfz-warte
bash deploy/install.sh
```
Das Skript fragt nach:
1. **Domain** (z. B. `kfz.drk-goehl.de`) – **oder einfach Enter drücken**, um erst nur über die **IP-Adresse** zu testen (siehe unten)
2. **E-Mail für das Zertifikat** (nur bei Domain; Ablaufwarnungen von Let's Encrypt)
3. **E-Mail und Benutzername des Administrators**
4. ob der **Fahrzeugbestand des OV Göhl** (11 Fahrzeuge) gleich importiert werden soll (empfohlen: `J`)

Danach macht es automatisch:
- installiert Docker (falls nicht vorhanden)
- erzeugt zufällige Passwörter (Datenbank, Admin, Cron-Geheimnis) in `deploy/.env` (nur für root lesbar)
- baut und startet App, PostgreSQL und Caddy (HTTPS); Datenbank-Migrationen laufen automatisch
- richtet Cronjobs ein: **06:15** Erinnerungslauf (HU, Monatskontrollen, Verfall, E-Mails), **02:30** Backup

Am Ende werden **Adresse, Admin-Benutzername und Admin-Passwort** angezeigt – sofort notieren.

### Nur über die IP testen (ohne Domain)
Bei der Frage nach der Domain einfach **Enter** drücken. Die App läuft dann unter `https://SERVER-IP` mit einem eigenen (selbst signierten) Zertifikat:
- Der Browser zeigt beim ersten Aufruf **„Verbindung ist nicht privat“** → „Erweitert“ → „Weiter zu … (unsicher)“. Das ist im Testbetrieb normal.
- Die App-Installation aufs Handy (PWA) und der Offline-Modus funktionieren erst mit echter Domain.

**Später auf Domain umstellen:** DNS-Eintrag anlegen, dann in `deploy/.env` ändern
```
DOMAIN="kfz.drk-goehl.de"
TLS="deine@email.de"
APP_URL="https://kfz.drk-goehl.de"
```
und `cd /opt/drk-kfz-warte/deploy && docker compose up -d` ausführen. Alle Daten bleiben erhalten.

## 4. Erste Schritte in der App
1. `https://DEINE-DOMAIN` öffnen und als Administrator anmelden.
2. **Profil → Passwort ändern.**
3. Auf dem Server das Start-Passwort aus der Konfiguration entfernen:
   ```bash
   nano /opt/drk-kfz-warte/deploy/.env     # Zeile SEED_ADMIN_PASSWORD löschen
   ```
4. **Fahrzeuge** prüfen und fehlende Angaben ergänzen (Kennzeichen RTW T1 / Anhänger / Feldkochherd, Baujahre, Modelle).
5. **Termine** anlegen (HU, Wartung, Prüfungen) – Erinnerungen 30/14/7 Tage vorher.
6. **Checklisten** je Fahrzeugtyp anpassen, **Material-Sollbestände** je Fahrzeug anlegen.
7. Helfer registrieren sich selbst unter `/registrieren`; du gibst sie unter **Verwaltung → Benutzer** frei und weist Rolle/Fahrzeuge zu.

## 5. E-Mail-Benachrichtigungen (optional)
In `deploy/.env` die SMTP-Daten eintragen (z. B. vom Mail-Anbieter des Ortsvereins):
```
SMTP_HOST="smtp.example.org"
SMTP_PORT=587
SMTP_USER="kfz@drk-goehl.de"
SMTP_PASSWORD="..."
SMTP_FROM="KFZ-Warte DRK Göhl <kfz@drk-goehl.de>"
```
Dann `cd /opt/drk-kfz-warte/deploy && docker compose up -d` und in der App unter **Einstellungen** „E-Mail-Benachrichtigungen“ aktivieren.

## 6. App auf Handy/Tablet installieren
- **Android:** Seite in Chrome öffnen → Menü → „App installieren“.
- **iPhone/iPad:** In Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Betrieb

| Aufgabe | Befehl (im Verzeichnis `/opt/drk-kfz-warte/deploy`) |
|---|---|
| Status | `docker compose ps` |
| Logs ansehen | `docker compose logs -f app` |
| Neustart | `docker compose restart app` |
| Backup sofort | `./backup.sh` |
| Wiederherstellen | `./restore.sh backups/db_DATUM.dump backups/uploads_DATUM.tar.gz` |
| Erinnerungen manuell | `docker compose exec app npx tsx scripts/run-reminders.ts` |
| Passwort zurücksetzen (Notfall) | `docker compose exec app npx tsx scripts/reset-password.ts BENUTZERNAME` |
| Fahrzeugbestand erneut abgleichen | `docker compose exec app npx tsx prisma/fahrzeuge-goehl.ts` (legt nur Fehlendes an) |

### Backups
Liegen in `/opt/drk-kfz-warte/deploy/backups` (Datenbank + Fotos/Anhänge, 30 Tage). **Bitte zusätzlich auf ein anderes System kopieren** (z. B. Backup-Speicher des Hosters per `rsync`/`restic`), sonst ist bei einem Serverausfall alles weg. Wiederherstellung gelegentlich testen.

### Update auf eine neue Version
```bash
cd /opt && unzip -o drk-kfz-warte-NEU.zip     # überschreibt Programmdateien, deploy/.env und Backups bleiben
bash /opt/drk-kfz-warte/deploy/update.sh # Backup → neu bauen → Migrationen laufen automatisch
```

## Sicherheitsempfehlungen
- SSH nur mit Schlüssel, Passwort-Login abschalten; `apt install unattended-upgrades` für automatische Sicherheitsupdates.
- Firewall nur 22, 80, 443 öffnen (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`).
- Die Datenbank ist **nicht** von außen erreichbar (nur intern im Docker-Netz). Anhänge liegen in einem privaten Volume und sind nur nach Anmeldung abrufbar.
- `deploy/.env` niemals weitergeben oder in Git einchecken.

## Fehlersuche
| Problem | Lösung |
|---|---|
| Seite lädt nicht / Zertifikatsfehler | DNS zeigt noch nicht auf den Server oder Port 80/443 beim Hoster gesperrt → `docker compose logs caddy` |
| „Anwendung startet nicht“ | `docker compose logs app` – meist falsche Werte in `deploy/.env` |
| Passwort vergessen / Konto gesperrt | `docker compose exec app npx tsx scripts/reset-password.ts BENUTZERNAME` – zeigt ein neues Passwort an (wird protokolliert) |
| Server hat wenig RAM, Build bricht ab | Swap anlegen: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
