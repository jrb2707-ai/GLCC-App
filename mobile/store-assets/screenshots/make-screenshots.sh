#!/usr/bin/env bash
# make-screenshots.sh — boots an iPhone 15 Pro Max simulator, installs the
# TestFlight/EAS-built GLCC IPA (or an in-progress `expo run:ios` build),
# signs in as the reviewer test account, walks the app through five key
# screens, and drops 1290×2796 PNGs into ./output/ ready for App Store Connect.
#
# Requirements (one-off):
#   xcode-select --install
#   brew install --cask maestro
#
# Usage:
#   ./make-screenshots.sh              # uses the app that's already installed
#   ./make-screenshots.sh --dev        # runs `expo run:ios` first (from ../..)
#
# The reviewer account is leo@glcc.club / cycle123 (regular member — no
# admin badges, cleanest App Store screenshots).

set -euo pipefail

SIMULATOR_NAME="iPhone 15 Pro Max"
BUNDLE_ID="com.greylynncc.app"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)/output"
FLOWS_DIR="$(cd "$(dirname "$0")" && pwd)/flows"

# ---------- pre-flight ----------
require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "❌  Missing $1 — install with: $2" >&2
    exit 1
  fi
}
require xcrun "xcode-select --install"
require maestro "brew install --cask maestro"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.png

# ---------- boot simulator ----------
echo "→ Booting $SIMULATOR_NAME…"
UDID=$(xcrun simctl list devices "iOS" available -j \
  | /usr/bin/python3 -c "import sys,json,re
data=json.load(sys.stdin)['devices']
for k,v in data.items():
    for d in v:
        if d['name']=='$SIMULATOR_NAME':
            print(d['udid']); sys.exit(0)")
if [ -z "${UDID:-}" ]; then
  echo "❌  Simulator '$SIMULATOR_NAME' not found. Open Xcode → Window → Devices and Simulators and add one." >&2
  exit 1
fi
xcrun simctl boot "$UDID" 2>/dev/null || true
open -a Simulator --args -CurrentDeviceUDID "$UDID"
xcrun simctl bootstatus "$UDID" -b

# Ensure light status bar (looks better on hero shots) & clean 9:41
xcrun simctl status_bar "$UDID" override \
  --time "9:41" \
  --dataNetwork wifi \
  --wifiMode active \
  --wifiBars 3 \
  --cellularMode active \
  --cellularBars 4 \
  --batteryState charged \
  --batteryLevel 100

# ---------- optional dev build ----------
if [ "${1:-}" = "--dev" ]; then
  echo "→ Running `expo run:ios` (this takes a few minutes on the first run)…"
  ( cd "$(dirname "$0")/../.." && npx expo run:ios --device "$UDID" --no-bundler ) &
  RUN_PID=$!
  # Wait for the app to install
  echo "   Waiting for $BUNDLE_ID to appear on the simulator…"
  for i in $(seq 1 60); do
    if xcrun simctl get_app_container "$UDID" "$BUNDLE_ID" >/dev/null 2>&1; then
      break
    fi
    sleep 5
  done
fi

# ---------- run each flow + capture ----------
SHOTS=(
  "01-auth"
  "02-rides-list"
  "03-ride-detail"
  "04-coffee"
  "05-member-card"
)

for name in "${SHOTS[@]}"; do
  echo "→ ($name)"
  maestro test "$FLOWS_DIR/$name.yaml"
  # Small settle so any transition finishes
  sleep 0.6
  xcrun simctl io "$UDID" screenshot --type=png "$OUT_DIR/$name.png"
  # Confirm 1290×2796 (iPhone 6.7"). If someone booted a smaller device this
  # catches it early instead of Apple rejecting the upload.
  DIM=$(sips -g pixelWidth -g pixelHeight "$OUT_DIR/$name.png" | awk '/pixel(Width|Height)/{print $2}' | paste -sd x -)
  echo "   saved $OUT_DIR/$name.png ($DIM)"
  if [ "$DIM" != "1290x2796" ] && [ "$DIM" != "2796x1290" ]; then
    echo "   ⚠️  expected 1290×2796 for the 6.7\" slot — check the simulator model." >&2
  fi
done

xcrun simctl status_bar "$UDID" clear

echo
echo "✅  Done. $(ls "$OUT_DIR" | wc -l | tr -d ' ') screenshots in $OUT_DIR"
echo "   Upload them at App Store Connect → Version → Screenshots → iPhone 6.7\""
