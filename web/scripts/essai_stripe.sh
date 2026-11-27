#!/bin/sh
# Lance le serveur (PHP intégré) puis l'essai du paiement Stripe : événements signés en local, aucun appel à Stripe.
set -e
ICI=$(cd "$(dirname "$0")/.." && pwd)
DONNEES=$(mktemp -d)
CONFIG="$DONNEES/config.php"
printf '%s\n' '<?php' 'return [];' > "$CONFIG"
PHP_CLI_SERVER_WORKERS=4 REGENVOX_CONFIG="$CONFIG" php -d opcache.enable=0 -S 127.0.0.1:8781 -t "$ICI/public" >/dev/null 2>&1 &
PID=$!
trap 'pkill -P $PID; kill $PID; rm -rf "$DONNEES"' EXIT
sleep 1
cd "$ICI/.." && npx tsx web/scripts/essai_stripe.ts http://127.0.0.1:8781/api "$CONFIG" "$DONNEES"
