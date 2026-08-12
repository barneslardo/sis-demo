#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pnpm exec pm2 stop sis-api sis-web 2>/dev/null || true
pnpm exec pm2 delete sis-api sis-web 2>/dev/null || true

echo "SIS API and Web stopped (Postgres Docker container still running)."
echo "To stop Postgres: docker compose down"
