#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${1:-$HOME/Documents/SISadminsApp.txt}"
TARGET="$ROOT/.env"

if [[ ! -f "$SOURCE" ]]; then
  echo "Source file not found: $SOURCE" >&2
  exit 1
fi

echo "Importing from: $SOURCE"
echo "Into: $TARGET"
python3 "$ROOT/scripts/import_admin_env.py" "$SOURCE" "$TARGET"

echo ""
echo "Next: FAST_START=1 pnpm start  (from $ROOT)"
