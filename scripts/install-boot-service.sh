#!/usr/bin/env bash
# Install systemd unit so SIS starts after reboot (Postgres + PM2 apps).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$ROOT/deploy/sis-demo.service"
UNIT_DEST="/etc/systemd/system/sis-demo.service"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash scripts/install-boot-service.sh"
  exit 1
fi

install -m 644 "$UNIT_SRC" "$UNIT_DEST"
systemctl daemon-reload
systemctl enable sis-demo.service
echo "Installed and enabled sis-demo.service"
echo "  sudo systemctl start sis-demo   # run recovery now"
echo "  sudo systemctl status sis-demo  # check status"
