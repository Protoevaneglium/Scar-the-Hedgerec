#!/usr/bin/env sh
# Scar the Hedgerec — Termux / Android Auto-Installer & "scar" Command Generator
# Usage:
#   sh install-termux.sh
# Or one-liner in Termux:
#   curl -fsSL https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-termux.sh | sh

set -e

REPO_URL="https://github.com/Protoevaneglium/Scar-the-Hedgerec.git"

# 1. Ensure Node.js and Git are installed in Termux
if command -v pkg >/dev/null 2>&1; then
    NEED_PKG=""
    command -v node >/dev/null 2>&1 || NEED_PKG="$NEED_PKG nodejs"
    command -v git  >/dev/null 2>&1 || NEED_PKG="$NEED_PKG git"
    if [ -n "$NEED_PKG" ]; then
        echo "Installing required Termux packages:$NEED_PKG ..."
        pkg update -y && pkg install -y $NEED_PKG
    fi
fi

# 2. Locate existing repo checkout or clone into ~/Scar-the-Hedgerec
SCRIPT_DIR=""
if [ -n "$0" ] && [ "$0" != "sh" ] && [ "$0" != "-sh" ] && [ "$0" != "bash" ]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
fi

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/server.js" ]; then
    GAME_DIR="$SCRIPT_DIR"
elif [ -f "./server.js" ]; then
    GAME_DIR="$(pwd)"
else
    GAME_DIR="${HOME}/Scar-the-Hedgerec"
    if [ -d "$GAME_DIR/.git" ]; then
        echo "Updating existing Scar the Hedgerec in $GAME_DIR ..."
        git -C "$GAME_DIR" pull --ff-only || true
    else
        echo "Cloning Scar the Hedgerec into $GAME_DIR ..."
        git clone "$REPO_URL" "$GAME_DIR"
    fi
fi

# 3. Determine global bin directory ($PREFIX/bin on Termux, ~/.local/bin fallback)
if [ -n "$PREFIX" ] && [ -d "$PREFIX/bin" ]; then
    BIN_DIR="$PREFIX/bin"
else
    BIN_DIR="${HOME}/.local/bin"
    mkdir -p "$BIN_DIR"
fi

SCAR_CMD="${BIN_DIR}/scar"
SCAR_BAT="${HOME}/scar.bat"

# 4. Auto-generate the executable "scar" launcher & ~/scar.bat
cat > "$SCAR_CMD" <<EOF
#!/usr/bin/env sh
# Auto-generated launcher for Scar the Hedgerec
cd "${GAME_DIR}" || exit 1
exec node server.js --open "\$@"
EOF
chmod +x "$SCAR_CMD"

cp "$SCAR_CMD" "$SCAR_BAT"
chmod +x "$SCAR_BAT"

# 5. Also ensure shell rc files have alias/PATH fallback if needed
ALIAS_LINE="alias scar='sh \"${SCAR_BAT}\"'"
for RC in "${HOME}/.bashrc" "${HOME}/.zshrc"; do
    if [ -f "$RC" ]; then
        grep -Fq "scar.bat" "$RC" 2>/dev/null || printf "\n# Scar the Hedgerec quick launcher\n%s\n" "$ALIAS_LINE" >> "$RC"
    fi
done
if [ ! -f "${HOME}/.bashrc" ]; then
    printf "# Scar the Hedgerec quick launcher\n%s\n" "$ALIAS_LINE" > "${HOME}/.bashrc"
fi

echo ""
echo "=========================================================="
echo " Scar the Hedgerec is installed!"
echo " Generated launcher: ${SCAR_CMD} (and ${SCAR_BAT})"
echo " Anytime you open Termux, just type:"
echo ""
echo "     scar"
echo ""
echo " and press Enter to launch the server and browser!"
echo "=========================================================="
