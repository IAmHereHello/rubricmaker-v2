#!/bin/bash
# Rubricmaker voor macOS: installeren, starten en bijwerken.
#
# Installeren (eenmalig, in Terminal):
#   curl -fsSL https://raw.githubusercontent.com/IAmHereHello/rubricmaker-v2/main/mac/rubricmaker.sh | bash
#
# Daarna start de app "Rubricmaker" op het bureaublad dit script met "start".
# Bij elke start wordt gekeken of er een nieuwe versie op GitHub staat.
#
# Alles komt in ~/Rubricmaker:
#   app/      de code (wordt bij een update vervangen)
#   data/     rubricmaker.db en backups/ (blijft altijd staan)
#   tools/    eigen Node.js, Python en uv (niets systeembreed, geen beheerdersrechten)
#   venv/     Python-omgeving van de backend
#   logs/     logbestanden
#
# Dit script roept bewust nooit git of de systeem-python aan: op een Mac zonder
# Xcode-hulpmiddelen opent dat een installatievenster.

set -euo pipefail

REPO_OWNER="IAmHereHello"
REPO_NAME="rubricmaker-v2"
BRANCH="${RUBRICMAKER_BRANCH:-main}"
INSTALL_DIR="${RUBRICMAKER_HOME:-$HOME/Rubricmaker}"
NODE_VERSION="v22.23.5"
PYTHON_VERSION="3.12"
FIRST_PORT=8765

APP_DIR="$INSTALL_DIR/app"
DATA_DIR="$INSTALL_DIR/data"
BACKUP_DIR="$DATA_DIR/backups"
TOOLS_DIR="$INSTALL_DIR/tools"
VENV_DIR="$INSTALL_DIR/venv"
LOG_DIR="$INSTALL_DIR/logs"
VERSION_FILE="$INSTALL_DIR/version"
PORT_FILE="$DATA_DIR/port"
PID_FILE="$DATA_DIR/server.pid"
LOCK_DIR="$INSTALL_DIR/.lock"
MAC_APP="$HOME/Applications/Rubricmaker.app"

export UV_PYTHON_INSTALL_DIR="$TOOLS_DIR/python"
export UV_CACHE_DIR="$TOOLS_DIR/uv-cache"
export UV_PYTHON_PREFERENCE="only-managed"
export npm_config_cache="$TOOLS_DIR/npm-cache"
export npm_config_update_notifier=false
export PATH="$TOOLS_DIR/node/bin:$TOOLS_DIR/uv:$PATH"

IS_MAC=0
[ "$(uname -s)" = "Darwin" ] && IS_MAC=1

# ---------- meldingen ----------

say() { printf '%s\n' "$*"; }

notify() {
    say "$1"
    if [ "$IS_MAC" = 1 ]; then
        osascript -e "display notification \"$1\" with title \"Rubricmaker\"" >/dev/null 2>&1 || true
    fi
}

alert() {
    say "FOUT: $1" >&2
    if [ "$IS_MAC" = 1 ] && [ ! -t 1 ]; then
        osascript -e "display dialog \"$1\" with title \"Rubricmaker\" buttons {\"OK\"} default button \"OK\" with icon caution" >/dev/null 2>&1 || true
    fi
}

open_url() {
    if [ -n "${RUBRICMAKER_OPEN_CMD:-}" ]; then
        $RUBRICMAKER_OPEN_CMD "$1"
    elif [ "$IS_MAC" = 1 ]; then
        open "$1"
    else
        say "Open in je browser: $1"
    fi
}

# ---------- platform ----------

detect_arch() {
    local arch
    arch="$(uname -m)"
    # Terminal kan onder Rosetta draaien op een Apple Silicon Mac; dan toch arm64 kiezen.
    if [ "$IS_MAC" = 1 ] && [ "$(sysctl -in sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
        arch="arm64"
    fi
    case "$arch" in
        arm64|aarch64) echo "arm64" ;;
        x86_64) echo "x64" ;;
        *) alert "Onbekend type processor: $arch"; exit 1 ;;
    esac
}

# ---------- hulpmiddelen ----------

download() { # url bestand
    curl -fL --retry 3 --connect-timeout 15 -sS -o "$2" "$1"
}

ensure_uv() {
    [ -x "$TOOLS_DIR/uv/uv" ] && return 0
    say "  uv (Python-installatiehulp) downloaden..."
    local target
    if [ "$IS_MAC" = 1 ]; then
        [ "$ARCH" = arm64 ] && target="aarch64-apple-darwin" || target="x86_64-apple-darwin"
    else
        [ "$ARCH" = arm64 ] && target="aarch64-unknown-linux-gnu" || target="x86_64-unknown-linux-gnu"
    fi
    local tmp
    tmp="$(mktemp -d)"
    download "https://github.com/astral-sh/uv/releases/latest/download/uv-$target.tar.gz" "$tmp/uv.tar.gz"
    mkdir -p "$TOOLS_DIR/uv"
    tar -xzf "$tmp/uv.tar.gz" -C "$TOOLS_DIR/uv" --strip-components=1
    rm -rf "$tmp"
}

ensure_node() {
    if [ -x "$TOOLS_DIR/node/bin/node" ] && [ "$(cat "$TOOLS_DIR/node/.version" 2>/dev/null)" = "$NODE_VERSION" ]; then
        return 0
    fi
    say "  Node.js $NODE_VERSION downloaden..."
    local os name tmp
    [ "$IS_MAC" = 1 ] && os="darwin" || os="linux"
    name="node-$NODE_VERSION-$os-$ARCH"
    tmp="$(mktemp -d)"
    download "https://nodejs.org/dist/$NODE_VERSION/$name.tar.gz" "$tmp/node.tar.gz"
    rm -rf "$TOOLS_DIR/node"
    mkdir -p "$TOOLS_DIR/node"
    tar -xzf "$tmp/node.tar.gz" -C "$TOOLS_DIR/node" --strip-components=1
    echo "$NODE_VERSION" > "$TOOLS_DIR/node/.version"
    rm -rf "$tmp"
}

ensure_venv() {
    [ -x "$VENV_DIR/bin/python" ] && return 0
    say "  Python $PYTHON_VERSION installeren..."
    uv venv --quiet --python "$PYTHON_VERSION" "$VENV_DIR"
}

# ---------- versies ----------

latest_version() { # print commit-id van de nieuwste versie, of niets bij geen internet
    if [ -n "${RUBRICMAKER_VERSION:-}" ]; then echo "$RUBRICMAKER_VERSION"; return 0; fi
    curl -fsS --max-time 5 "https://github.com/$REPO_OWNER/$REPO_NAME.git/info/refs?service=git-upload-pack" 2>/dev/null \
        | grep -ao "[0-9a-f]\{40\} refs/heads/$BRANCH\$" | head -1 | cut -c1-40 || true
}

installed_version() { cat "$VERSION_FILE" 2>/dev/null || true; }

# ---------- server ----------

current_port() { cat "$PORT_FILE" 2>/dev/null || echo "$FIRST_PORT"; }

server_running() {
    curl -fsS --max-time 2 "http://127.0.0.1:$(current_port)/api/" 2>/dev/null | grep -q "Rubricmaker API"
}

stop_server() {
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && ps -p "$pid" -o command= 2>/dev/null | grep -q "backend.local_server"; then
        kill "$pid" 2>/dev/null || true
        for _ in $(seq 1 20); do
            ps -p "$pid" >/dev/null 2>&1 || break
            sleep 0.25
        done
    fi
    rm -f "$PID_FILE"
}

start_server() {
    mkdir -p "$DATA_DIR" "$LOG_DIR"
    rm -f "$PORT_FILE"
    (
        cd "$DATA_DIR"
        PYTHONPATH="$APP_DIR" nohup "$VENV_DIR/bin/python" -m backend.local_server \
            --port "$FIRST_PORT" --port-file "$PORT_FILE" >> "$LOG_DIR/server.log" 2>&1 &
        echo $! > "$PID_FILE"
    )
    for _ in $(seq 1 60); do
        if [ -f "$PORT_FILE" ] && server_running; then return 0; fi
        sleep 0.5
    done
    return 1
}

# ---------- backups ----------

backup_db() { # reden
    local db="$DATA_DIR/rubricmaker.db"
    [ -f "$db" ] || return 0
    mkdir -p "$BACKUP_DIR"
    local dest
    dest="$BACKUP_DIR/rubricmaker-$(date +%Y-%m-%d_%H%M%S)-$1.db"
    "$VENV_DIR/bin/python" -c "import sqlite3,sys; s=sqlite3.connect(sys.argv[1]); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()" "$db" "$dest"
    # Bewaar de nieuwste 20 backups.
    ls -1t "$BACKUP_DIR"/rubricmaker-*.db 2>/dev/null | tail -n +21 | while read -r old; do rm -f "$old"; done
}

daily_backup() {
    ls "$BACKUP_DIR"/rubricmaker-"$(date +%Y-%m-%d)"_*.db >/dev/null 2>&1 && return 0
    backup_db "dagelijks"
}

# ---------- code ophalen en bouwen ----------

install_version() { # commit-id
    local version="$1" new="$INSTALL_DIR/app.new" tmp
    tmp="$(mktemp -d)"
    rm -rf "$new"
    mkdir -p "$new"

    say "  Code downloaden..."
    download "${RUBRICMAKER_TARBALL:-https://codeload.github.com/$REPO_OWNER/$REPO_NAME/tar.gz/$version}" "$tmp/src.tar.gz" || return 1
    tar -xzf "$tmp/src.tar.gz" -C "$new" --strip-components=1 || return 1
    rm -rf "$tmp"

    say "  Backend-onderdelen installeren..."
    uv pip install --quiet --python "$VENV_DIR/bin/python" -r "$new/backend/requirements.txt" || return 1

    say "  Frontend bouwen (kan een minuut duren)..."
    (
        cd "$new/frontend" &&
        npm ci --no-audit --no-fund --loglevel=error >> "$LOG_DIR/install.log" 2>&1 &&
        npm run build >> "$LOG_DIR/install.log" 2>&1 &&
        rm -rf node_modules
    ) || return 1
    [ -f "$new/frontend/dist/index.html" ] || return 1

    backup_db "voor-update" || return 1
    rm -rf "$INSTALL_DIR/app.old"
    [ -d "$APP_DIR" ] && mv "$APP_DIR" "$INSTALL_DIR/app.old"
    mv "$new" "$APP_DIR"
    rm -rf "$INSTALL_DIR/app.old"
    echo "$version" > "$VERSION_FILE"
}

# ---------- snelkoppeling ----------

create_mac_app() {
    [ "$IS_MAC" = 1 ] || return 0
    mkdir -p "$MAC_APP/Contents/MacOS" "$MAC_APP/Contents/Resources"
    cat > "$MAC_APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>Rubricmaker</string>
    <key>CFBundleDisplayName</key><string>Rubricmaker</string>
    <key>CFBundleIdentifier</key><string>nl.rubricmaker.launcher</string>
    <key>CFBundleExecutable</key><string>Rubricmaker</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
    cat > "$MAC_APP/Contents/MacOS/Rubricmaker" <<LAUNCHER
#!/bin/bash
export RUBRICMAKER_HOME="$INSTALL_DIR"
exec /bin/bash "$APP_DIR/mac/rubricmaker.sh" start
LAUNCHER
    chmod +x "$MAC_APP/Contents/MacOS/Rubricmaker"
    if [ -f "$APP_DIR/mac/AppIcon.icns" ]; then
        cp "$APP_DIR/mac/AppIcon.icns" "$MAC_APP/Contents/Resources/AppIcon.icns"
    fi
    # Bureaublad-snelkoppeling (verwijst naar de app in ~/Applications).
    ln -sfn "$MAC_APP" "$HOME/Desktop/Rubricmaker.app"
    touch "$MAC_APP"
}

# ---------- vergrendeling (dubbel klikken) ----------

take_lock() {
    if [ -d "$LOCK_DIR" ] && [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +15 2>/dev/null)" ]; then
        rm -rf "$LOCK_DIR"
    fi
    mkdir "$LOCK_DIR" 2>/dev/null || return 1
    trap 'rm -rf "$LOCK_DIR"' EXIT
}

# ---------- commando's ----------

cmd_install() {
    say ""
    say "=== Rubricmaker installeren ==="
    say ""
    if [ "$IS_MAC" != 1 ] && [ -z "${RUBRICMAKER_ALLOW_OTHER_OS:-}" ]; then
        alert "Dit installatiescript is bedoeld voor macOS."
        exit 1
    fi
    mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$TOOLS_DIR" "$LOG_DIR"
    take_lock || { alert "Er draait al een installatie of start van Rubricmaker."; exit 1; }

    say "[1/4] Benodigde programma's klaarzetten..."
    ensure_uv
    ensure_node
    ensure_venv

    say "[2/4] Nieuwste versie van Rubricmaker ophalen..."
    local version
    version="$(latest_version)"
    if [ -z "$version" ]; then
        alert "Kan GitHub niet bereiken. Controleer je internetverbinding en probeer het opnieuw."
        exit 1
    fi
    stop_server
    install_version "$version" || { alert "Bouwen mislukt. Zie $LOG_DIR/install.log"; exit 1; }

    say "[3/4] Snelkoppeling op het bureaublad maken..."
    create_mac_app

    say "[4/4] Rubricmaker starten..."
    start_server || { alert "Rubricmaker start niet. Zie $LOG_DIR/server.log"; exit 1; }
    open_url "http://127.0.0.1:$(current_port)"

    say ""
    say "Klaar! Rubricmaker staat open in je browser."
    say "Volgende keer: dubbelklik op 'Rubricmaker' op je bureaublad."
    say "Je gegevens staan in $DATA_DIR (alleen op deze computer)."
}

cmd_start() {
    if [ ! -x "$VENV_DIR/bin/python" ] || [ ! -f "$APP_DIR/frontend/dist/index.html" ]; then
        alert "Rubricmaker is niet (volledig) geïnstalleerd. Voer het installatiecommando opnieuw uit."
        exit 1
    fi
    if ! take_lock; then
        # Er wordt al gestart; open alleen de browser zodra de server er is.
        for _ in $(seq 1 120); do server_running && break; sleep 1; done
        server_running && open_url "http://127.0.0.1:$(current_port)"
        exit 0
    fi

    local latest
    latest="$(latest_version)"
    if [ -n "$latest" ] && [ "$latest" != "$(installed_version)" ]; then
        notify "Nieuwe versie gevonden. Rubricmaker wordt bijgewerkt, dit duurt ongeveer een minuut."
        ensure_uv && ensure_node && ensure_venv || true
        stop_server
        if install_version "$latest" >> "$LOG_DIR/install.log" 2>&1; then
            create_mac_app
        else
            rm -rf "$INSTALL_DIR/app.new"
            alert "Bijwerken is mislukt. Je werkt verder met de vorige versie."
        fi
    fi

    if ! server_running; then
        daily_backup || true
        stop_server
        start_server || { alert "Rubricmaker start niet. Zie $LOG_DIR/server.log"; exit 1; }
    fi
    open_url "http://127.0.0.1:$(current_port)"
}

cmd_stop() { stop_server; say "Rubricmaker is gestopt."; }

main() {
    ARCH="$(detect_arch)"
    case "${1:-install}" in
        install|update) cmd_install ;;
        start) cmd_start ;;
        stop) cmd_stop ;;
        *) say "Gebruik: $0 [install|start|stop]"; exit 1 ;;
    esac
}

# Alles staat in functies, zodat bash het hele script inleest voordat het begint
# (veilig bij "curl | bash" en wanneer een update dit bestand vervangt).
main "$@" < /dev/null
exit 0
