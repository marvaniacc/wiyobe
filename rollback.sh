#!/usr/bin/env bash
# ============================================================================
# Wishubest — Rollback Script (native deploy)
# ============================================================================
# Restores the most recent build backup and restarts the app.
# Usage: bash rollback.sh
# ============================================================================

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PM2_APP="wishubest"
PORT=3000
BACKUP_DIR="/var/backups/wiyobe-deploy"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Wishubest — Rollback"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LATEST_BUILD="$(ls -1t "$BACKUP_DIR"/next_*.tar.gz 2>/dev/null | head -1 || true)"
if [ -z "$LATEST_BUILD" ]; then
  echo "❌ No build backup found in $BACKUP_DIR"
  exit 1
fi

echo "↩️  Restoring build from: $LATEST_BUILD"
cd "$APP_DIR"
rm -rf .next
tar xzf "$LATEST_BUILD" -C "$APP_DIR"

echo "🚀 Restarting pm2 ($PM2_APP)..."
pm2 restart "$PM2_APP" --update-env --max-restarts 10
pm2 save

for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
    echo "✅ App is back up at http://localhost:$PORT"
    exit 0
  fi
  sleep 2
done

echo "⚠️  App didn't respond in 60s. Check logs: pm2 logs $PM2_APP --lines 50"
exit 1