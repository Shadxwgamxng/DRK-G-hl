#!/usr/bin/env bash
# Update: neues Paket über das alte Verzeichnis entpacken (deploy/.env bleibt erhalten) oder git pull,
# dann:  bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")"
./backup.sh
docker compose up -d --build
docker image prune -f >/dev/null
echo "Update abgeschlossen (Migrationen wurden automatisch angewendet)."
