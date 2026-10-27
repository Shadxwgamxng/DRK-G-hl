#!/usr/bin/env bash
# Sichert Datenbank und Anhänge nach deploy/backups (Aufbewahrung 30 Tage).
# Backups zusätzlich verschlüsselt auf ein anderes System kopieren (z. B. restic, rsync)!
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups && chmod 700 backups
STAMP=$(date +%F_%H%M)
docker compose exec -T db pg_dump -U drk -Fc drk_kfz > "backups/db_$STAMP.dump"
docker compose exec -T app tar -czf - -C /data/uploads . > "backups/uploads_$STAMP.tar.gz"
find backups -type f -mtime +30 -delete
echo "$(date '+%F %T') Backup ok: db_$STAMP.dump, uploads_$STAMP.tar.gz"
