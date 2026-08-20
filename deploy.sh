#!/usr/bin/env bash
# ============================================================================
# Wishubest — VPS Deployment Script (native: pm2 + Caddy, NO Docker)
# ============================================================================
# Usage:  bash deploy.sh
# Prerequisites: Node.js + PostgreSQL + pm2 installed natively on the VPS
#
# Safety features:
#   - Build gate: refuses to restart unless .next/BUILD_ID exists (prevents
#     the 502/crash-loop class of outage from Phase 0).
#   - pm2 --max-restarts: the app process auto-shuts if it crashes repeatedly.
#   - Rollback: the previous build and DB are backed up before deploying.
# ============================================================================

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PM2_APP="wishubest"
PORT=3000
BACKUP_DIR="/var/backups/wiyobe-deploy"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Wishubest — Production Deployment (native)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 0: Check prerequisites ──────────────────────────────────────────────
for cmd in node npm pm2 git; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "❌ '$cmd' is not installed."
    exit 1
  fi
done

cd "$APP_DIR"

# ── Step 1: .env check ───────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "❌ No .env file found in $APP_DIR"
  exit 1
fi
# Refuse to deploy with placeholder secrets
if grep -q "change-me\|change-me-to-a-long-random-string\|your-smtp-password" .env 2>/dev/null; then
  echo "❌ .env still contains placeholder values. Fix it first."
  exit 1
fi

# ── Step 2: Backup current build + DB (rollback point) ───────────────────────
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
if [ -d .next ]; then
  echo "💾 Backing up current build → $BACKUP_DIR/next_$STAMP.tar.gz"
  tar czf "$BACKUP_DIR/next_$STAMP.tar.gz" .next
  # keep only the last 5 build backups
  ls -1t "$BACKUP_DIR"/next_*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
fi
DB_USER="wishubest_admin"
DB_NAME="wishubest"
if command -v pg_dump &> /dev/null; then
  echo "💾 Backing up database → $BACKUP_DIR/db_$STAMP.dump"
  PGPASSWORD="85391b65e66cbe58a506bf42f1546c7f05f9acee00c21f0ec0893f0a8ff8ca35" pg_dump -h localhost -U "$DB_USER" "$DB_NAME" -Fc -f "$BACKUP_DIR/db_$STAMP.dump" 2>/dev/null \
    || echo "⚠️  DB backup failed (continuing anyway)."
  ls -1t "$BACKUP_DIR"/db_*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
fi

# ── Step 3: Pull latest code ─────────────────────────────────────────────────
echo ""
echo "📦 Pulling latest code..."
git pull --ff-only origin main || git pull --ff-only origin opencode-work || true

# ── Step 4: Install dependencies ─────────────────────────────────────────────
echo ""
echo "📥 Installing dependencies..."
npm install --omit=dev 2>&1 | tail -2 || npm install 2>&1 | tail -2

# ── Step 5: Database schema ──────────────────────────────────────────────────
echo ""
echo "📊 Pushing database schema (prisma db push)..."
npx prisma db push --skip-generate 2>&1 | tail -3

# ── Step 6: Build with gate ──────────────────────────────────────────────────
echo ""
echo "🔨 Building (npm run build)..."
npm run build 2>&1 | tail -10

# BUILD GATE — if the build didn't produce BUILD_ID, roll back immediately.
if [ ! -f .next/BUILD_ID ]; then
  echo "❌ BUILD GATE FAILED: .next/BUILD_ID missing after build."
  if [ -f "$BACKUP_DIR/next_$STAMP.tar.gz" ]; then
    echo "↩️  Rolling back to previous build..."
    rm -rf .next
    tar xzf "$BACKUP_DIR/next_$STAMP.tar.gz" -C "$APP_DIR"
  fi
  exit 1
fi
echo "✅ Build gate passed (BUILD_ID: $(cat .next/BUILD_ID))"

# ── Step 7: Restart pm2 with crash guard ─────────────────────────────────────
echo ""
echo "🚀 Restarting pm2 ($PM2_APP)..."
pm2 restart "$PM2_APP" --update-env --max-restarts 10 2>/dev/null \
  || pm2 start ecosystem.config.cjs --only "$PM2_APP" --max-restarts 10 2>/dev/null \
  || pm2 start "node_modules/next/dist/bin/next" --name "$PM2_APP" -- start -p "$PORT" --max-restarts 10
pm2 save

# ── Step 8: Wait for readiness (health gate) ─────────────────────────────────
echo ""
echo "⏳ Waiting for app to be ready..."
APP_READY=0
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then
    APP_READY=1
    echo "✅ App is ready!"
    break
  fi
  if ! pm2 describe "$PM2_APP" > /dev/null 2>&1 || [ "$(pm2 jlist | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);const p=j.find(x=>x.name==="'$PM2_APP'");console.log(p?p.pm2_env.restart_time:999)})' 2>/dev/null || echo 999)" -gt 30 ]; then
    echo "❌ App crashed too many times — health gate failed."
    break
  fi
  sleep 2
done

if [ "$APP_READY" -ne 1 ]; then
  echo "⚠️  App didn't respond in 60s. Check logs: pm2 logs $PM2_APP --lines 50"
  echo "   Rollback: extract the newest backup in $BACKUP_DIR and pm2 restart $PM2_APP"
  exit 1
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  App:  http://localhost:$PORT"
echo "  DB:   localhost:5432/wishubest"
echo ""
echo "  Logs:     pm2 logs $PM2_APP"
echo "  Status:   pm2 status"
echo "  Rollback: bash rollback.sh"
echo ""