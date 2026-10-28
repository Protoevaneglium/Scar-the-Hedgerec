#!/usr/bin/env sh
# Scar the Hedgerec — Linux & macOS Launcher
set -e

cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
    node server.js --open
else
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "public/index.html"
    elif command -v open >/dev/null 2>&1; then
        open "public/index.html"
    else
        echo "Open public/index.html in your web browser."
    fi
fi
