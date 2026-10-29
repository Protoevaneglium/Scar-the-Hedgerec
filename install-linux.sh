#!/usr/bin/env sh
# Scar the Hedgerec - Linux & macOS First-Time Auto-Installer & "scar" Launcher Generator
# One-line First-Time Install:
#   curl -fsSL https://raw.githubusercontent.com/Protoevaneglium/Scar-the-Hedgerec/main/install-linux.sh | sh

set -e

REPO_URL="https://github.com/Protoevaneglium/Scar-the-Hedgerec.git"
TAR_URL="https://github.com/Protoevaneglium/Scar-the-Hedgerec/archive/refs/heads/main.tar.gz"
QUIET=0
if [ "${1:-}" = "--quiet" ]; then
    QUIET=1
fi

log() {
    if [ "$QUIET" -eq 0 ]; then
        echo "$@"
    fi
}

# 1. Detect Node.js (`node` or `nodejs`) and auto-install if possible
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
    NODE_BIN="node"
elif command -v nodejs >/dev/null 2>&1; then
    NODE_BIN="nodejs"
fi

if [ -z "$NODE_BIN" ]; then
    SUDO=""
    if [ "$(id -u 2>/dev/null || echo 1)" -eq 0 ]; then
        SUDO=""
    elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
        SUDO="sudo"
    fi

    if command -v pkg >/dev/null 2>&1; then
        log "Installing Node.js via pkg..."
        pkg update -y && pkg install -y nodejs || true
    elif [ "$(id -u 2>/dev/null || echo 1)" -eq 0 ] || [ -n "$SUDO" ]; then
        if command -v apt-get >/dev/null 2>&1; then
            log "Installing Node.js via apt-get..."
            $SUDO apt-get update -y && $SUDO apt-get install -y nodejs || true
        elif command -v dnf >/dev/null 2>&1; then
            log "Installing Node.js via dnf..."
            $SUDO dnf install -y nodejs || true
        elif command -v pacman >/dev/null 2>&1; then
            log "Installing Node.js via pacman..."
            $SUDO pacman -Sy --noconfirm nodejs || true
        elif command -v apk >/dev/null 2>&1; then
            log "Installing Node.js via apk..."
            $SUDO apk add --no-cache nodejs || true
        elif command -v zypper >/dev/null 2>&1; then
            log "Installing Node.js via zypper..."
            $SUDO zypper --non-interactive install nodejs || true
        fi
    elif command -v brew >/dev/null 2>&1; then
        log "Installing Node.js via Homebrew..."
        brew install node || true
    fi

    if command -v node >/dev/null 2>&1; then
        NODE_BIN="node"
    elif command -v nodejs >/dev/null 2>&1; then
        NODE_BIN="nodejs"
    else
        log "Note: Node.js was not detected. Install nodejs with your package manager (e.g. 'sudo apt install -y nodejs') for full server & audio support."
    fi
fi

# 2. Locate existing repo checkout or install/update ~/Scar-the-Hedgerec
SCRIPT_DIR=""
if [ -n "$0" ] && [ "$0" != "sh" ] && [ "$0" != "-sh" ] && [ "$0" != "bash" ] && [ "$0" != "-bash" ]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
fi

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/server.js" ]; then
    GAME_DIR="$SCRIPT_DIR"
else
    GAME_DIR="${HOME}/Scar-the-Hedgerec"
    if [ -d "$GAME_DIR/.git" ] && command -v git >/dev/null 2>&1; then
        log "Updating existing Scar the Hedgerec in $GAME_DIR ..."
        git -C "$GAME_DIR" fetch origin main || true
        if [ -z "$(git -C "$GAME_DIR" status --porcelain 2>/dev/null)" ]; then
            git -C "$GAME_DIR" checkout -B main origin/main || git -C "$GAME_DIR" pull --ff-only || true
        else
            git -C "$GAME_DIR" pull --rebase --autostash origin main || git -C "$GAME_DIR" pull --ff-only || true
        fi
    elif [ ! -d "$GAME_DIR" ] && command -v git >/dev/null 2>&1; then
        log "Cloning Scar the Hedgerec into $GAME_DIR ..."
        git clone "$REPO_URL" "$GAME_DIR"
    else
        log "Downloading latest Scar the Hedgerec archive into $GAME_DIR ..."
        TMP_DIR="$(mktemp -d 2>/dev/null || echo "/tmp/scar-install-$$")"
        mkdir -p "$TMP_DIR" "$GAME_DIR"
        if command -v curl >/dev/null 2>&1; then
            curl -fsSL "$TAR_URL" -o "$TMP_DIR/scar.tar.gz"
        elif command -v wget >/dev/null 2>&1; then
            wget -qO "$TMP_DIR/scar.tar.gz" "$TAR_URL"
        else
            echo "Error: curl, wget, or git is required to download Scar the Hedgerec."
            exit 1
        fi
        tar -xzf "$TMP_DIR/scar.tar.gz" -C "$TMP_DIR"
        SRC_EXTRACT="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
        cp -R "$SRC_EXTRACT"/. "$GAME_DIR"/
        rm -rf "$TMP_DIR"
    fi
fi

# 3. Auto-generate the global executable `scar` command & `~/scar.sh`
if [ -n "${PREFIX:-}" ] && [ -d "${PREFIX}/bin" ] && [ -w "${PREFIX}/bin" ]; then
    BIN_DIR="${PREFIX}/bin"
else
    BIN_DIR="${HOME}/.local/bin"
    mkdir -p "$BIN_DIR"
fi

SCAR_CMD="${BIN_DIR}/scar"
SCAR_SH="${HOME}/scar.sh"

cat > "$SCAR_CMD" <<EOF
#!/usr/bin/env sh
# Auto-generated launcher for Scar the Hedgerec
cd "${GAME_DIR}" || exit 1
if command -v node >/dev/null 2>&1; then
    exec node server.js --open "\$@"
elif command -v nodejs >/dev/null 2>&1; then
    exec nodejs server.js --open "\$@"
elif command -v xdg-open >/dev/null 2>&1; then
    exec xdg-open "${GAME_DIR}/public/index.html"
elif command -v open >/dev/null 2>&1; then
    exec open "${GAME_DIR}/public/index.html"
else
    echo "Please install Node.js (e.g. sudo apt install -y nodejs) or open ${GAME_DIR}/public/index.html"
    exit 1
fi
EOF
chmod +x "$SCAR_CMD"

cp "$SCAR_CMD" "$SCAR_SH"
chmod +x "$SCAR_SH"

# Also copy to /usr/local/bin/scar if writable without sudo (instant PATH on many Linux/macOS setups)
if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
    cp "$SCAR_CMD" "/usr/local/bin/scar" 2>/dev/null || true
    chmod +x "/usr/local/bin/scar" 2>/dev/null || true
fi

# 4. Ensure ~/.local/bin is in PATH and `scar` alias exists across bash, zsh & login shells
PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
ALIAS_LINE="alias scar='sh \"${SCAR_SH}\"'"

update_rc() {
    RC_FILE="$1"
    if [ -f "$RC_FILE" ]; then
        grep -Fq ".local/bin" "$RC_FILE" 2>/dev/null || printf "\n# Scar the Hedgerec PATH\n%s\n" "$PATH_LINE" >> "$RC_FILE"
        grep -Fq "scar.sh" "$RC_FILE" 2>/dev/null || printf "%s\n" "$ALIAS_LINE" >> "$RC_FILE"
    fi
}

update_rc "${HOME}/.bashrc"
update_rc "${HOME}/.zshrc"
update_rc "${HOME}/.profile"
if [ ! -f "${HOME}/.bashrc" ] && [ ! -f "${HOME}/.zshrc" ]; then
    printf "# Scar the Hedgerec quick launcher\n%s\n%s\n" "$PATH_LINE" "$ALIAS_LINE" > "${HOME}/.bashrc"
fi

# 5. Optional Linux Desktop shortcut entry (~/.local/share/applications)
if [ -d "${HOME}/.local/share/applications" ]; then
    DESKTOP_FILE="${HOME}/.local/share/applications/scar-the-hedgerec.desktop"
    cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Scar the Hedgerec
Comment=Launch Scar the Hedgerec 16-bit Platformer
Exec=${SCAR_CMD}
Path=${GAME_DIR}
Terminal=true
Categories=Game;ArcadeGame;
EOF
    chmod +x "$DESKTOP_FILE" 2>/dev/null || true
fi

if [ "$QUIET" -eq 0 ]; then
    echo ""
    echo "=========================================================="
    echo " Scar the Hedgerec is installed on Linux / macOS!"
    echo " Game directory : ${GAME_DIR}"
    echo " Generated cmd  : ${SCAR_CMD} (and ${SCAR_SH})"
    echo ""
    echo " HOW TO START EVERY TIME:"
    echo " Open any terminal window and type:"
    echo ""
    echo "     scar"
    echo ""
    echo " and press Enter to launch the server and browser!"
    echo " (To run immediately in this current terminal, type: sh ~/scar.sh)"
    echo "=========================================================="
fi
