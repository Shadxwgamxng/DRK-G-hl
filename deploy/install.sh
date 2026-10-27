#!/usr/bin/env bash
# DRK Göhl – KFZ-Warte: Installation auf einem Root-Server (Debian/Ubuntu) – OHNE Demo-Daten.
# Aufruf aus dem entpackten Verzeichnis:  sudo bash deploy/install.sh
set -euo pipefail

cd "$(dirname "$0")"
DEPLOY_DIR="$(pwd)"
APP_DIR="$(cd .. && pwd)"

if [ "$(id -u)" -ne 0 ]; then echo "Bitte mit sudo/als root ausführen."; exit 1; fi

echo "== DRK Göhl – KFZ-Warte: Installation =="

# 1) Docker
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "-> Docker wird installiert (offizielles Docker-Repository) ..."
  apt-get update -y && apt-get install -y ca-certificates curl
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# 2) Konfiguration
rand() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
if [ ! -f .env ]; then
  read -rp "Domain der App (z. B. kfz.drk-goehl.de): " DOMAIN
  read -rp "E-Mail für Let's-Encrypt-Zertifikat: " ACME_EMAIL
  read -rp "E-Mail-Adresse des Administrators: " ADMIN_EMAIL
  read -rp "Benutzername des Administrators [admin]: " ADMIN_USER
  ADMIN_USER=${ADMIN_USER:-admin}
  ADMIN_PASS="$(rand 20)"
  cat > .env <<ENV
DOMAIN="$DOMAIN"
ACME_EMAIL="$ACME_EMAIL"
APP_URL="https://$DOMAIN"
POSTGRES_PASSWORD="$(rand 40)"
SEED_ADMIN_USERNAME="$ADMIN_USER"
SEED_ADMIN_EMAIL="$ADMIN_EMAIL"
SEED_ADMIN_PASSWORD="$ADMIN_PASS"
CRON_SECRET="$(rand 48)"
UPLOAD_MAX_MB=15
SESSION_TTL_HOURS=12
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM="KFZ-Warte DRK Göhl <kfz@$DOMAIN>"
ENV
  chmod 600 .env
  FIRST_INSTALL=1
else
  echo "-> Vorhandene deploy/.env wird verwendet."
  FIRST_INSTALL=0
fi

# 3) Firewall (falls ufw aktiv)
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
fi

# 4) Bauen & starten (Migrationen + Basis-Seed laufen beim Start automatisch)
echo "-> Anwendung wird gebaut und gestartet (dauert beim ersten Mal einige Minuten) ..."
docker compose up -d --build

echo "-> Warte auf die Anwendung ..."
for _ in $(seq 1 60); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then OK=1; break; fi
  sleep 5
done
[ "${OK:-0}" = 1 ] || { echo "Anwendung startet nicht – Logs: docker compose -f $DEPLOY_DIR/docker-compose.yml logs app"; exit 1; }

# 5) Fahrzeugbestand DRK OV Göhl (optional, mehrfach ausführbar)
if [ "$FIRST_INSTALL" = 1 ]; then
  read -rp "Fahrzeugbestand des DRK OV Göhl (11 Fahrzeuge) importieren? [J/n] " FLEET
  if [ "${FLEET:-J}" != "n" ] && [ "${FLEET:-J}" != "N" ]; then
    docker compose exec -T app npx tsx prisma/fahrzeuge-goehl.ts
  fi
fi

# 6) Cronjobs: täglicher Erinnerungslauf + nächtliches Backup
chmod +x "$DEPLOY_DIR"/*.sh
cat > /etc/cron.d/drk-kfz-warte <<CRON
# DRK Göhl – KFZ-Warte
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Erinnerungen (HU, Monatskontrollen, Verfall, E-Mails)
15 6 * * * root cd $DEPLOY_DIR && docker compose exec -T app npx tsx scripts/run-reminders.ts >> /var/log/drk-kfz-reminders.log 2>&1
# Backup Datenbank + Anhänge (30 Tage aufbewahrt)
30 2 * * * root $DEPLOY_DIR/backup.sh >> /var/log/drk-kfz-backup.log 2>&1
CRON

echo
echo "================================================================"
echo " Fertig!  https://$(grep '^DOMAIN=' .env | cut -d'"' -f2)"
if [ "$FIRST_INSTALL" = 1 ]; then
  echo " Administrator:  $ADMIN_USER"
  echo " Passwort:       $ADMIN_PASS"
  echo " -> Bitte sofort nach der ersten Anmeldung im Profil ändern"
  echo "    und danach SEED_ADMIN_PASSWORD aus $DEPLOY_DIR/.env löschen."
fi
echo " Backups:  $DEPLOY_DIR/backups   (täglich 02:30)"
echo " Update:   sudo bash $DEPLOY_DIR/update.sh"
echo "================================================================"
