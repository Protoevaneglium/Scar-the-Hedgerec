#!/usr/bin/env sh
# Scar the Hedgerec — Termux / Android Launcher
set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
    echo "Installing Node.js in Termux..."
    pkg update -y && pkg install -y nodejs
fi

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

echo "Starting Scar the Hedgerec on ${URL} ..."
node server.js --open
