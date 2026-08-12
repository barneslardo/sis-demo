#!/usr/bin/env bash
# Idempotent recovery: start SIS if API health check fails (for cron or manual use).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if curl -sf "http://127.0.0.1:3010/health" >/dev/null 2>&1 && curl -sf "http://127.0.0.1:5173/" >/dev/null 2>&1; then
  echo "SIS already healthy."
  exit 0
fi

echo "SIS unhealthy — running fast recovery..."
FAST_START=1 bash scripts/start.sh
