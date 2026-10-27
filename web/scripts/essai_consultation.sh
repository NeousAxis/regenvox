#!/bin/sh
# Lance le serveur de collecte en local (PHP intégré) puis l'essai de bout en bout.
set -e
ICI=$(cd "$(dirname "$0")/.." && pwd)
DONNEES=$(mktemp -d)
REGENVOX_DONNEES="$DONNEES" php -S 127.0.0.1:8765 -t "$ICI/public" >/dev/null 2>&1 &
PID=$!
trap 'kill $PID; rm -rf "$DONNEES"' EXIT
sleep 1
cd "$ICI/.." && npx tsx web/scripts/essai_consultation.ts http://127.0.0.1:8765/api/consultation.php
