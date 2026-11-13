#!/usr/bin/env bash
# Stream-Software aus GitHub aktualisieren.
#   ./update.sh               aktuellen Branch aktualisieren
#   ./update.sh vorschlaege   auf den Branch „vorschlaege“ wechseln (zum Testen)
#   ./update.sh main          zurück auf den freigegebenen Stand
# Zugangsdaten (config.json, client_secret.json, token.json) und node_modules bleiben unberührt.
set -euo pipefail
cd "$(dirname "$0")"

ZIEL="${1:-$(git rev-parse --abbrev-ref HEAD)}"

if curl -s --max-time 3 http://localhost:3555/status | grep -q '"streamRunning":true'; then
  if [ "${UPDATE_AUTOMATISCH:-}" = "1" ]; then echo "Gerade läuft ein Stream. Update abgebrochen."; exit 1; fi
  read -r -p "Achtung: Gerade läuft ein Stream. Trotzdem aktualisieren und neu starten? (j/n) " antwort
  [ "$antwort" = "j" ] || { echo "Abgebrochen."; exit 1; }
fi

lock_vorher=$(sha1sum package-lock.json 2>/dev/null | cut -d' ' -f1 || true)
git fetch --prune origin
git checkout -q -B "$ZIEL" "origin/$ZIEL"
lock_nachher=$(sha1sum package-lock.json | cut -d' ' -f1)

if [ "$lock_vorher" != "$lock_nachher" ] || [ ! -d node_modules ]; then
  echo "Pakete haben sich geändert: npm ci (dauert einige Minuten) …"
  npm ci --omit=dev
fi

echo "Stand jetzt: $ZIEL – $(git log -1 --format='%h %s (%cd)' --date=format:'%d.%m.%Y %H:%M')"

# Neu starten, je nachdem wie die Software auf diesem Pi läuft
if systemctl list-unit-files 2>/dev/null | grep -q '^gsa-stream\.service'; then
  sudo systemctl restart gsa-stream && echo "Dienst gsa-stream neu gestartet."
elif command -v pm2 >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -q 'app.js'; then
  pm2 restart all && echo "pm2 neu gestartet."
else
  echo "Bitte die Stream-Software jetzt neu starten (im Zweifel: sudo reboot)."
fi
