#!/usr/bin/env sh
# Scar the Hedgerec - Quick "scar.sh" Launcher (Linux & macOS)
set -e

GAME_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$GAME_DIR"

if [ -f "$GAME_DIR/install-linux.sh" ] && [ ! -f "${HOME}/.local/bin/scar" ]; then
    sh "$GAME_DIR/install-linux.sh" --quiet >/dev/null 2>&1 || true
fi

if command -v node >/dev/null 2>&1; then
    exec node server.js --open "$@"
elif command -v nodejs >/dev/null 2>&1; then
    exec nodejs server.js --open "$@"
elif command -v xdg-open >/dev/null 2>&1; then
    exec xdg-open "public/index.html"
elif command -v open >/dev/null 2>&1; then
    exec open "public/index.html"
else
    echo "Open public/index.html in your web browser."
fi
