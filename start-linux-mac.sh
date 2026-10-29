#!/usr/bin/env sh
# Scar the Hedgerec — Linux & macOS Launcher
set -e

GAME_DIR="$(cd "$(dirname "$0")" && pwd)"
exec sh "$GAME_DIR/scar.sh" "$@"
