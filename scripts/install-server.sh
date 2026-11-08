#!/bin/sh
set -eu
repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
binary=${1:-"$repo_dir/backend/target/release/contraption-room-server"}
if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Run with sudo: sudo sh scripts/install-server.sh [path-to-linux-binary]' >&2
  exit 1
fi
if ! command -v systemctl >/dev/null 2>&1; then
  printf '%s\n' 'This installer requires Linux with systemd.' >&2
  exit 1
fi
if [ ! -f "$binary" ] || [ ! -x "$binary" ]; then
  printf 'Missing executable: %s\nBuild first with sh scripts/build-server.sh, or supply a Linux binary.\n' "$binary" >&2
  exit 1
fi
install -d -m 755 /opt/tank-game
# Atomic replacement allows updating while the old executable is still running.
install -m 755 "$binary" /opt/tank-game/contraption-room-server.new
mv -f /opt/tank-game/contraption-room-server.new /opt/tank-game/contraption-room-server
install -m 644 "$repo_dir/deploy/systemd/tank-game.service" /etc/systemd/system/tank-game.service
systemctl daemon-reload
systemctl enable tank-game.service
systemctl restart tank-game.service
printf '%s\n' 'Installed. Check: systemctl status tank-game.service' \
  'Health: curl --fail http://127.0.0.1:8787/api/health' \
  'Logs: journalctl -u tank-game.service -f'
