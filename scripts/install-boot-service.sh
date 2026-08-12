#!/usr/bin/env bash
# Install systemd unit so SIS starts after reboot (Postgres + PM2 apps).
# The unit template is rendered for the invoking user and this checkout's path,
# so it works on any host (bare metal, EC2, etc.).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$ROOT/deploy/sis-demo.service"
UNIT_DEST="/etc/systemd/system/sis-demo.service"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash scripts/install-boot-service.sh"
  exit 1
fi

RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_GROUP="$(id -gn "$RUN_USER")"

sed \
  -e "s|__RUN_USER__|$RUN_USER|g" \
  -e "s|__RUN_GROUP__|$RUN_GROUP|g" \
  -e "s|__APP_DIR__|$ROOT|g" \
  "$UNIT_SRC" > "$UNIT_DEST"
chmod 644 "$UNIT_DEST"
systemctl daemon-reload
systemctl enable sis-demo.service
echo "Installed and enabled sis-demo.service (User=$RUN_USER, WorkingDirectory=$ROOT)"
echo "  sudo systemctl start sis-demo   # run recovery now"
echo "  sudo systemctl status sis-demo  # check status"
