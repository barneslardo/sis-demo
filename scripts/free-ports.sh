#!/usr/bin/env bash
# Release SIS ports if a non-PM2 process is holding them (prevents EADDRINUSE crash loops).
set -euo pipefail

free_port() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -ti ":${port}" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      kill $pids 2>/dev/null || true
    fi
  fi
}

free_port 3010
free_port 5173
sleep 1
