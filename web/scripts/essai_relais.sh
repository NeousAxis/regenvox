#!/bin/sh
# Lance le relais des abonnements en local (PHP intégré, plusieurs processus) puis l'essai contre un faux fournisseur.
set -e
ICI=$(cd "$(dirname "$0")/.." && pwd)
DONNEES=$(mktemp -d)
CONFIG="$DONNEES/config.php"
printf '%s\n' '<?php' 'return [];' > "$CONFIG"
# opcache.enable=0 : sans cela, le serveur intégré garde config.php compilé deux secondes et l'essai, qui la réécrit souvent, lirait l'ancienne.
PHP_CLI_SERVER_WORKERS=8 REGENVOX_DONNEES="$DONNEES" REGENVOX_CONFIG="$CONFIG" php -d opcache.enable=0 -S 127.0.0.1:8767 -t "$ICI/public" >/dev/null 2>&1 &
PID=$!
trap 'pkill -P $PID; kill $PID; rm -rf "$DONNEES"' EXIT
sleep 1
cd "$ICI/.." && npx tsx web/scripts/essai_relais.ts http://127.0.0.1:8767/api/ia.php "$CONFIG" "$DONNEES" 8768
