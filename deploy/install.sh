#!/usr/bin/env bash
# DRK Göhl – KFZ-Warte: Installation auf einem Root-Server (Debian/Ubuntu) – OHNE Demo-Daten.
# Aufruf aus dem entpackten Verzeichnis (als root):  bash deploy/install.sh
set -euo pipefail

cd "$(dirname "$0")"
DEPLOY_DIR="$(pwd)"

if [ "$(id -u)" -ne 0 ]; then echo "Bitte als root ausführen (z. B. nach „su -“ oder per SSH als root)."; exit 1; fi

echo "== DRK Göhl – KFZ-Warte: Installation =="

# Zufallswerte ohne Pipe-Abbruch (head liest eine feste Menge, kein SIGPIPE unter pipefail)
rand() { head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-"$1"; }
port_busy() { ss -Htln "sport = :$1" 2>/dev/null | grep -q .; }

# 1) Werkzeuge & Docker
apt-get update -y >/dev/null && apt-get install -y ca-certificates curl iproute2 dnsutils >/dev/null
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "-> Docker wird installiert (offizielles Docker-Repository) ..."
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
PUBLIC_IP="$(curl -4fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

# 2) Konfiguration
if [ ! -f .env ]; then
  echo "Domain (z. B. kfz.drk-goehl.de) eingeben – oder leer lassen, um erst einmal"
  read -rp "nur über die IP ${PUBLIC_IP} zu testen: " DOMAIN
  DOMAIN="${DOMAIN// /}"
  if [ -z "$DOMAIN" ] || [[ "$DOMAIN" =~ ^[0-9.]+$ ]]; then
    DOMAIN="${DOMAIN:-$PUBLIC_IP}"
    CERT_EMAIL="internal"
  else
    read -rp "E-Mail für das HTTPS-Zertifikat (Let's Encrypt): " CERT_EMAIL
  fi
  read -rp "E-Mail-Adresse des Administrators: " ADMIN_EMAIL
  while true; do
    read -rp "Benutzername des Administrators [admin]: " ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-admin}
    [[ "$ADMIN_USER" =~ ^[A-Za-z0-9._-]{3,40}$ ]] && break
    echo "   Nur Buchstaben, Ziffern, Punkt, Binde- und Unterstrich (3–40 Zeichen, keine Leerzeichen), z. B. lucas.e"
  done

  # Läuft bereits ein Webserver (z. B. nginx) auf Port 80/443? Dann diesen als Proxy verwenden.
  if port_busy 80 || port_busy 443; then
    PROXY="nginx"
    echo "-> Port 80/443 ist bereits belegt (z. B. durch nginx)."
    echo "   Die App wird hinter dem vorhandenen nginx betrieben."
    command -v nginx >/dev/null 2>&1 || { echo "Port 80/443 belegt, aber kein nginx gefunden. Bitte Port freigeben oder Proxy manuell einrichten (siehe Anleitung)."; exit 1; }
    APP_PORT=3000
    while port_busy "$APP_PORT"; do APP_PORT=$((APP_PORT + 1)); done
  else
    PROXY="caddy"
    APP_PORT=3000
  fi

  ADMIN_PASS="Kfz-$(rand 16)"
  cat > .env <<ENV
DOMAIN="$DOMAIN"
TLS="$CERT_EMAIL"
APP_URL="https://$DOMAIN"
# caddy = eigener HTTPS-Proxy im Docker · nginx = vorhandener nginx auf dem Server
PROXY="$PROXY"
COMPOSE_PROFILES="$([ "$PROXY" = caddy ] && echo caddy || echo none)"
APP_PORT=$APP_PORT
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
SMTP_FROM="KFZ-Warte DRK Göhl <kfz@example.org>"
ENV
  chmod 600 .env
  FIRST_INSTALL=1
else
  echo "-> Vorhandene deploy/.env wird verwendet."
  FIRST_INSTALL=0
fi
# shellcheck disable=SC1091
set -a; . ./.env; set +a
PROXY="${PROXY:-caddy}"

# 3) Firewall (falls ufw aktiv)
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
fi

# 4) Bauen & starten (Migrationen + Basis-Seed laufen beim Start automatisch)
echo "-> Anwendung wird gebaut und gestartet (beim ersten Mal 3–10 Minuten) ..."
docker compose up -d --build

echo "-> Warte auf die Anwendung ..."
OK=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null 2>/dev/null "http://127.0.0.1:${APP_PORT:-3000}/api/health"; then OK=1; break; fi
  sleep 5
done
[ "$OK" = 1 ] || { echo "Anwendung startet nicht – Logs: cd $DEPLOY_DIR && docker compose logs app"; exit 1; }

# 5) Vorhandenen nginx als HTTPS-Proxy einrichten
CERT_HINT=""
if [ "$PROXY" = "nginx" ]; then
  if [ -d /etc/nginx/sites-available ]; then CONF=/etc/nginx/sites-available/drk-kfz-warte.conf; else CONF=/etc/nginx/conf.d/drk-kfz-warte.conf; fi
  if [ ! -f "$CONF" ]; then
    cat > "$CONF" <<NGINX
# DRK Göhl – KFZ-Warte (von deploy/install.sh angelegt)
server {
    listen 80;
$( [ -s /proc/net/if_inet6 ] && echo '    listen [::]:80;' )
    server_name $DOMAIN;
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
    [ -d /etc/nginx/sites-enabled ] && ln -sf "$CONF" /etc/nginx/sites-enabled/drk-kfz-warte.conf
    if nginx -t 2>/dev/null; then
      systemctl reload nginx 2>/dev/null || nginx -s reload
      echo "-> nginx-Konfiguration angelegt: $CONF"
    else
      rm -f "$CONF" /etc/nginx/sites-enabled/drk-kfz-warte.conf
      echo "!! nginx-Konfiguration fehlerhaft – nicht übernommen. Bitte manuell einrichten (siehe Anleitung)."
      nginx -t || true
    fi
  fi
  # HTTPS-Zertifikat über certbot (nur wenn die Domain bereits auf diesen Server zeigt)
  DNS_IP="$(dig +short A "$DOMAIN" | tail -1)"
  if [ "$TLS" = "internal" ]; then
    CERT_HINT="Nur-IP-Betrieb hinter nginx: HTTPS muss in nginx manuell eingerichtet werden (Anmeldung benötigt HTTPS)."
  elif [ "$DNS_IP" != "$PUBLIC_IP" ]; then
    CERT_HINT="DNS: $DOMAIN zeigt auf ${DNS_IP:-nichts}, der Server hat $PUBLIC_IP. A-Eintrag korrigieren, dann:
   certbot --nginx -d $DOMAIN -m $TLS --agree-tos --redirect -n"
  else
    command -v certbot >/dev/null 2>&1 || apt-get install -y certbot python3-certbot-nginx >/dev/null
    if certbot --nginx -d "$DOMAIN" -m "$TLS" --agree-tos --redirect -n; then
      echo "-> HTTPS-Zertifikat eingerichtet."
    else
      CERT_HINT="Zertifikat konnte nicht erstellt werden. Später erneut: certbot --nginx -d $DOMAIN -m $TLS --agree-tos --redirect -n"
    fi
  fi
fi

# 6) Fahrzeugbestand DRK OV Göhl (optional, mehrfach ausführbar)
if [ "$FIRST_INSTALL" = 1 ]; then
  read -rp "Fahrzeugbestand des DRK OV Göhl (11 Fahrzeuge) importieren? [J/n] " FLEET
  if [ "${FLEET:-J}" != "n" ] && [ "${FLEET:-J}" != "N" ]; then
    docker compose exec -T app npx tsx prisma/fahrzeuge-goehl.ts
  fi
  read -rp "Standard-Materialkatalog (293 Artikel, ohne Mengen) importieren? [J/n] " CATALOG
  if [ "${CATALOG:-J}" != "n" ] && [ "${CATALOG:-J}" != "N" ]; then
    docker compose exec -T app npx tsx prisma/materialkatalog.ts
  fi
fi

# 7) Cronjobs: täglicher Erinnerungslauf + nächtliches Backup
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
echo " Fertig!  https://$DOMAIN"
if [ "$FIRST_INSTALL" = 1 ]; then
  echo " Administrator:  $ADMIN_USER"
  echo " Passwort:       $ADMIN_PASS"
  echo " -> Bitte sofort nach der ersten Anmeldung im Profil ändern"
  echo "    und danach SEED_ADMIN_PASSWORD aus $DEPLOY_DIR/.env löschen."
fi
[ -n "$CERT_HINT" ] && echo " !! $CERT_HINT"
echo " Backups:  $DEPLOY_DIR/backups   (täglich 02:30)"
echo " Update:   bash $DEPLOY_DIR/update.sh"
echo "================================================================"
