#!/usr/bin/env bash
# ============================================================================
# Wishubest — VPS Deployment Script
# ============================================================================
# Usage:  bash deploy.sh
# Prerequisites: Docker + Docker Compose installed on the VPS
# ============================================================================

set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Wishubest — Production Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 0: Check prerequisites ──────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed. Install it first: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
  echo "❌ Docker Compose is not installed."
  exit 1
fi

# Detect which docker compose command to use
COMPOSE="docker compose"
if ! $COMPOSE version &> /dev/null; then
  COMPOSE="docker-compose"
fi

# ── Step 1: Pull latest code ─────────────────────────────────────────────────
echo ""
echo "📦 Pulling latest code..."
git pull origin main

# ── Step 2: Check .env file ──────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "⚠️  No .env file found. Copying from .env.example..."
  cp .env.example .env
  echo "❌ Please edit .env with real values and re-run deploy.sh"
  exit 1
fi

# ── Step 3: Build containers ─────────────────────────────────────────────────
echo ""
echo "🔨 Building containers..."
$COMPOSE build

# ── Step 4: Start services ───────────────────────────────────────────────────
echo ""
echo "🚀 Starting services..."
$COMPOSE up -d

# ── Step 5: Wait for app to be ready ─────────────────────────────────────────
echo ""
echo "⏳ Waiting for app to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/ > /dev/null 2>&1; then
    echo "✅ App is ready!"
    break
  fi
  sleep 2
  if [ $i -eq 30 ]; then
    echo "⚠️  App didn't respond in 60s. Check logs: $COMPOSE logs app"
  fi
done

# ── Step 6: Push database schema ─────────────────────────────────────────────
echo ""
echo "📊 Pushing database schema..."
$COMPOSE exec -T app npx prisma db push

# ── Step 7: Seed data (optional — uncomment if needed) ───────────────────────
# echo ""
# echo "🌱 Seeding locations..."
# $COMPOSE exec -T app bun run scripts/seed-locations.ts
#
# echo "🌱 Seeding base data..."
# $COMPOSE exec -T app bun run scripts/seed.ts
#
# echo "🌱 Seeding KYC requirements..."
# $COMPOSE exec -T app bun run scripts/seed-kyc-requirements.ts

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  App:  http://localhost:3000"
echo "  DB:   localhost:5432"
echo ""
echo "  Logs:        $COMPOSE logs -f app"
echo "  Stop:        $COMPOSE down"
echo "  Restart:     $COMPOSE restart app"
echo ""
