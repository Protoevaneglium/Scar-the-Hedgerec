#!/usr/bin/env sh
# Scar the Hedgerec — Termux / Android Launcher
# Automatically generates the global `scar` command (and ~/scar.bat) on first run,
# then starts the game server and launches the Android browser!
set -e

GAME_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$GAME_DIR"

if ! command -v node >/dev/null 2>&1; then
    if command -v pkg >/dev/null 2>&1; then
        echo "Installing Node.js in Termux..."
        pkg update -y && pkg install -y nodejs
    else
        echo "Error: Node.js is required to run the server."
        exit 1
    fi
fi

# Auto-generate the `scar` command & ~/scar.bat so next time the user opens Termux,
# they can simply type `scar` from anywhere!
sh "$GAME_DIR/install-termux.sh" >/dev/null 2>&1 || true

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

echo "Launching Scar the Hedgerec on ${URL} (tip: next time in Termux, just type 'scar')..."
exec node server.js --open "$@"
