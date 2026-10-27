#!/usr/bin/env bash
# Wiederherstellung:  bash deploy/restore.sh backups/db_DATUM.dump backups/uploads_DATUM.tar.gz
# ACHTUNG: überschreibt die aktuelle Datenbank und alle Anhänge!
set -euo pipefail
cd "$(dirname "$0")"
DB_DUMP=${1:?Pfad zur .dump-Datei angeben}
UPLOADS=${2:?Pfad zur uploads_*.tar.gz angeben}
read -rp "Aktuelle Daten werden ÜBERSCHRIEBEN. Fortfahren? (ja/nein) " A
[ "$A" = "ja" ] || exit 1
docker compose stop app
docker compose exec -T db dropdb -U drk drk_kfz
docker compose exec -T db createdb -U drk drk_kfz
docker compose exec -T db pg_restore -U drk --no-owner -d drk_kfz < "$DB_DUMP"
docker compose run --rm -T --no-deps --entrypoint sh app -c "rm -rf /data/uploads/* && tar -xzf - -C /data/uploads" < "$UPLOADS"
docker compose start app
echo "Wiederherstellung abgeschlossen."
