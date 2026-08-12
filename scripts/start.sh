#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# FAST_START=1 skips install/db push (use for recovery when deps and schema are already good)
FAST_START="${FAST_START:-0}"

echo "==> Starting Postgres (Docker)..."
docker compose up -d --wait 2>/dev/null || docker compose up -d

if [[ "$FAST_START" != "1" ]]; then
  echo "==> Installing dependencies..."
  pnpm install

  echo "==> Building apps..."
  pnpm build

  echo "==> Syncing database schema..."
  pnpm db:push
else
  echo "==> FAST_START: ensuring API/Web builds exist..."
  pnpm --filter @sis/shared build
  pnpm --filter @sis/api build
  pnpm --filter @sis/web build
fi

echo "==> Stopping previous PM2 apps and freeing ports..."
pnpm exec pm2 delete sis-api sis-web 2>/dev/null || true
bash scripts/free-ports.sh

echo "==> Starting API + Web with PM2..."
pnpm exec pm2 start ecosystem.config.cjs
pnpm exec pm2 save

bash scripts/wait-health.sh "http://127.0.0.1:3010/health" "http://127.0.0.1:5173/" 30 2

echo ""
pnpm exec pm2 status
echo ""
echo "SIS is running in the background."
echo "  Web:  https://sis.skylarbarnes.com  (port 5173)"
echo "  API:  https://sis-api.skylarbarnes.com  (port 3010)"
echo ""
echo "Logs:       pnpm logs"
echo "Stop:       pnpm stop"
echo "Restart:    pnpm restart"
echo "Quick up:   FAST_START=1 pnpm start"
echo ""
echo "Optional — start on boot: pnpm exec pm2 startup  (then run the command it prints)"
