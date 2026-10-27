# Installation & Deployment

> **Root-Server mit automatischem HTTPS, Backups und Cronjobs:** siehe [INSTALLATION-ROOTSERVER.md](INSTALLATION-ROOTSERVER.md) (`sudo bash deploy/install.sh`).

## Voraussetzungen
- Linux-Server, Docker + Docker Compose **oder** Node.js 22 und PostgreSQL 16
- Domain mit TLS (HTTPS ist Pflicht für PWA, Kamera und sichere Cookies)

## Variante A: Docker Compose
```bash
cp .env.example .env        # APP_URL, SEED_ADMIN_*, CRON_SECRET, optional SMTP_* setzen
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
docker compose up -d --build
```
Beim Start werden Migrationen angewendet und der (idempotente) Basis-Seed ausgeführt. Nach der ersten Anmeldung das Admin-Passwort ändern und `SEED_ADMIN_PASSWORD` aus `.env` entfernen.

Reverse-Proxy (Beispiel Caddy):
```
kfz.example.org {
  reverse_proxy 127.0.0.1:3000
  request_body { max_size 20MB }
}
```

## Variante B: ohne Docker
```bash
npm ci
npx prisma migrate deploy
npm run db:seed
npm run build
NODE_ENV=production node .next/standalone/server.js   # vorher .next/static und public nach .next/standalone kopieren
```
Empfohlen als systemd-Dienst mit eigenem Benutzer; `UPLOAD_DIR` außerhalb des Webroots, Rechte `700`.

## Täglicher Erinnerungslauf (Pflicht)
Erzeugt Termin-/Verfalls-/Kontrollerinnerungen, versendet optionale E-Mails, entfernt verwaiste Uploads und abgelaufene Sitzungen. Mehrfachaufrufe erzeugen keine doppelten Meldungen.
```cron
15 6 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://kfz.example.org/api/cron/reminders
```
Alternativ im Container: `npm run reminders`.

## E-Mail
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` setzen und unter Einstellungen „E-Mail-Benachrichtigungen“ aktivieren. Benutzer können E-Mails im Profil abbestellen.

## PWA-Installation
- **Android (Chrome/Edge):** Installationshinweis in der App oder Menü → „App installieren“. Benachrichtigungen erscheinen in der App (Glocke); Web-Push ist als Erweiterung vorbereitet (Service Worker vorhanden).
- **iOS/iPadOS (ab 16.4):** Safari → Teilen → „Zum Home-Bildschirm“. Web-Push funktioniert unter iOS nur für installierte PWAs und nach Zustimmung; daher sind In-App- und E-Mail-Benachrichtigungen der Standard.
- Kamera: Über `capture="environment"` öffnet sich auf Smartphones/Tablets direkt die Kamera; alternativ Galerie/Datei.

## Updates
`git pull && docker compose up -d --build` – Migrationen laufen automatisch. Vorher Backup erstellen (siehe BACKUP.md).

## Gesundheitsprüfung
`GET /api/health` → `{"ok":true}` (für Monitoring).
