#!/usr/bin/env bash
set -euo pipefail

API_URL="${1:-http://127.0.0.1:3010/health}"
WEB_URL="${2:-http://127.0.0.1:5173/}"
TRIES="${3:-30}"
SLEEP_SEC="${4:-2}"

wait_url() {
  local url="$1"
  local label="$2"
  local i
  for ((i = 1; i <= TRIES; i++)); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "  OK $label"
      return 0
    fi
    sleep "$SLEEP_SEC"
  done
  echo "  FAIL $label ($url)" >&2
  return 1
}

echo "==> Waiting for services..."
wait_url "$API_URL" "API"
wait_url "$WEB_URL" "Web"
