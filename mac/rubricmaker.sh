#!/bin/bash
# Rubricmaker voor macOS: installeren, starten en bijwerken.
#
# Installeren (eenmalig, in Terminal):
#   curl -fsSL https://raw.githubusercontent.com/IAmHereHello/rubricmaker-v2/main/mac/rubricmaker.sh | bash
#
# Daarna start de app "Rubricmaker" op het bureaublad dit script met "start".
# Bij elke start wordt gekeken of er een nieuwe versie op GitHub staat.
#
# Alles komt in ~/Rubricmaker (of ~/Rubricmaker-app als er al een andere map met die naam is):
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
# Testversie: installeer met RUBRICMAKER_BRANCH=<branch>; de snelkoppeling blijft die
# branch volgen tot je opnieuw installeert zonder deze variabele (dan weer main).
BRANCH="${RUBRICMAKER_BRANCH:-main}"
MARKER=".rubricmaker-install"
if [ -n "${RUBRICMAKER_HOME:-}" ]; then
    INSTALL_DIR="$RUBRICMAKER_HOME"
elif [ ! -e "$HOME/Rubricmaker" ] || [ -f "$HOME/Rubricmaker/$MARKER" ]; then
    INSTALL_DIR="$HOME/Rubricmaker"
else
    # Er staat al een andere map Rubricmaker (macOS ziet rubricmaker en Rubricmaker als
    # dezelfde map). Die laten we met rust.
    INSTALL_DIR="$HOME/Rubricmaker-app"
fi
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

# ---------- voortgangspagina tijdens bijwerken ----------
# Bij een update opent de browser meteen een pagina die laat zien waar het bijwerken is.
# Een klein Python-servertje (uit de eigen venv) serveert die pagina vanuit $STATUS_DIR.
# Als alles klaar is, springt de pagina vanzelf door naar Rubricmaker.

STATUS_DIR="$INSTALL_DIR/status"
STATUS_ACTIVE=0

STATUS_SERVER_PY=$(cat <<'PY'
import http.server, json, os, sys, threading, time
home = sys.argv[1]
os.chdir(home)
inode = os.stat(home).st_ino
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *args):
        pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
with open("port.tmp", "w") as f:
    f.write(str(srv.server_address[1]))
os.replace("port.tmp", "port")
def watch():
    start, done_at = time.time(), None
    while True:
        time.sleep(1)
        try:
            with open("status.json") as f:
                done = json.load(f).get("done")
        except Exception:
            done = False
        if done and done_at is None:
            done_at = time.time()
        try:
            replaced = os.stat(home).st_ino != inode  # nieuwe update gestart
        except OSError:
            replaced = True
        if replaced or (done_at and time.time() - done_at > 30) or time.time() - start > 1800:
            srv.shutdown()
            return
threading.Thread(target=watch, daemon=True).start()
srv.serve_forever()
PY
)

status_write() { # stap(0-5) melding [url] [fout]
    [ "$STATUS_ACTIVE" = 1 ] || return 0
    local done=false
    [ -n "${3:-}${4:-}" ] && done=true
    printf '{"step": %s, "message": "%s", "done": %s, "url": "%s", "error": "%s"}\n' \
        "$1" "$2" "$done" "${3:-}" "${4:-}" > "$STATUS_DIR/status.tmp"
    mv -f "$STATUS_DIR/status.tmp" "$STATUS_DIR/status.json"
}

status_step() { status_write "$1" "$2"; }

status_url() { # adres van de voortgangspagina als die nog draait
    local port
    port="$(cat "$STATUS_DIR/port" 2>/dev/null || true)"
    [ -n "$port" ] && curl -fsS --max-time 1 "http://127.0.0.1:$port/status.json" >/dev/null 2>&1 \
        && echo "http://127.0.0.1:$port/"
    return 0
}

status_begin() {
    [ -n "${RUBRICMAKER_NO_STATUS_PAGE:-}" ] && return 1
    rm -rf "$STATUS_DIR"
    mkdir -p "$STATUS_DIR"
    write_status_page > "$STATUS_DIR/index.html"
    STATUS_ACTIVE=1
    status_step 0 "Nieuwe versie gevonden"
    (
        nohup "$VENV_DIR/bin/python" -c "$STATUS_SERVER_PY" "$STATUS_DIR" >> "$LOG_DIR/status.log" 2>&1 &
    )
    for _ in $(seq 1 20); do
        if [ -n "$(status_url)" ]; then
            open_url "$(status_url)"
            return 0
        fi
        sleep 0.25
    done
    STATUS_ACTIVE=0
    return 1
}

status_finish() { # url [fout]
    status_write 5 "Klaar" "${1:-}" "${2:-}"
    STATUS_ACTIVE=0
}

write_status_page() {
    cat <<'HTML'
<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rubricmaker wordt bijgewerkt</title>
<style>
  :root { --navy: #1e3a5f; --line: #e0e3ea; --bg: #f0f3f8; --muted: #5b6577; --red: #c0392b; --green: #2e7d4f; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: var(--bg); color: #1d2433; padding: 16px;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 32px 36px;
          width: 100%; max-width: 460px; box-shadow: 0 8px 30px rgba(30, 58, 95, .08); }
  h1 { margin: 0 0 6px; font-size: 22px; color: var(--navy); }
  p.sub { margin: 0 0 22px; color: var(--muted); line-height: 1.45; }
  .bar { height: 8px; background: var(--line); border-radius: 99px; overflow: hidden; margin-bottom: 22px; }
  .bar > div { height: 100%; width: 3%; background: var(--navy); border-radius: 99px; transition: width .8s ease; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 12px; padding: 7px 0; color: var(--muted); }
  li .dot { width: 22px; height: 22px; flex: none; border-radius: 50%; border: 2px solid var(--line);
            display: flex; align-items: center; justify-content: center; font-size: 13px; color: #fff; }
  li.now { color: #1d2433; font-weight: 600; }
  li.now .dot { border-color: var(--navy); border-top-color: transparent; animation: spin 0.9s linear infinite; }
  li.done .dot { background: var(--green); border-color: var(--green); }
  li.done .dot::after { content: "\2713"; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .note { margin-top: 22px; font-size: 14px; color: var(--muted); }
  .note.err { color: var(--red); }
</style>
</head>
<body>
<div class="card">
  <h1 id="title">Rubricmaker wordt bijgewerkt</h1>
  <p class="sub" id="sub">Er is een nieuwe versie. Dit duurt meestal een à twee minuten. Je hoeft niets te doen: zodra het klaar is, opent Rubricmaker vanzelf in dit venster.</p>
  <div class="bar"><div id="bar"></div></div>
  <ol id="steps">
    <li><span class="dot"></span>Nieuwe versie downloaden</li>
    <li><span class="dot"></span>Onderdelen installeren</li>
    <li><span class="dot"></span>App opbouwen (duurt het langst)</li>
    <li><span class="dot"></span>Backup van je gegevens maken</li>
    <li><span class="dot"></span>Rubricmaker starten</li>
  </ol>
  <p class="note" id="note">Je gegevens blijven gewoon bewaard.</p>
</div>
<script>
  var fails = 0, shown = 0, target = 0;
  var steps = document.querySelectorAll("#steps li");
  function render(step) {
    for (var i = 0; i < steps.length; i++) {
      steps[i].className = i < step - 1 ? "done" : (i === step - 1 ? "now" : "");
    }
    target = Math.max(3, Math.round((step - 1) / steps.length * 100));
  }
  // Laat de balk binnen een stap langzaam doorlopen, zodat zichtbaar is dat er iets gebeurt.
  setInterval(function () {
    var cap = target + 100 / steps.length - 2;
    shown = shown < target ? target : Math.min(cap, shown + 0.4);
    document.getElementById("bar").style.width = shown + "%";
  }, 500);
  function poll() {
    fetch("status.json?" + Date.now()).then(function (r) { return r.json(); }).then(function (s) {
      fails = 0;
      if (s.done) {
        for (var i = 0; i < steps.length; i++) steps[i].className = "done";
        target = shown = 100;
        document.getElementById("bar").style.width = "100%";
        var note = document.getElementById("note");
        document.getElementById("sub").style.display = "none";
        if (s.error) {
          document.getElementById("steps").style.display = "none";
          document.getElementById("title").textContent = "Bijwerken is niet gelukt";
          note.className = "note err";
          note.textContent = s.url ? s.error + " Rubricmaker opent zo." : s.error + " Klik opnieuw op het Rubricmaker-icoon. Lukt het dan nog niet, vraag hulp.";
        } else {
          document.getElementById("title").textContent = "Klaar!";
          note.textContent = "Rubricmaker wordt geopend...";
        }
        if (s.url) setTimeout(function () { location.replace(s.url); }, s.error ? 4000 : 800);
        return;
      }
      render(s.step || 1);
      setTimeout(poll, 1000);
    }).catch(function () {
      if (++fails > 15) {
        var note = document.getElementById("note");
        note.className = "note err";
        note.textContent = "Geen contact meer met het bijwerken. Klik opnieuw op het Rubricmaker-icoon.";
        return;
      }
      setTimeout(poll, 1000);
    });
  }
  render(1);
  poll();
</script>
</body>
</html>
HTML
}

# ---------- code ophalen en bouwen ----------

install_version() { # commit-id
    local version="$1" new="$INSTALL_DIR/app.new" tmp
    tmp="$(mktemp -d)"
    rm -rf "$new"
    mkdir -p "$new"

    say "  Code downloaden..."
    status_step 1 "Nieuwe versie downloaden"
    download "${RUBRICMAKER_TARBALL:-https://codeload.github.com/$REPO_OWNER/$REPO_NAME/tar.gz/$version}" "$tmp/src.tar.gz" || return 1
    tar -xzf "$tmp/src.tar.gz" -C "$new" --strip-components=1 || return 1
    rm -rf "$tmp"

    say "  Backend-onderdelen installeren..."
    status_step 2 "Onderdelen installeren"
    uv pip install --quiet --python "$VENV_DIR/bin/python" -r "$new/backend/requirements.txt" || return 1

    say "  Frontend bouwen (kan een minuut duren)..."
    status_step 3 "App opbouwen"
    (
        cd "$new/frontend" &&
        npm ci --no-audit --no-fund --loglevel=error >> "$LOG_DIR/install.log" 2>&1 &&
        npm run build >> "$LOG_DIR/install.log" 2>&1 &&
        rm -rf node_modules
    ) || return 1
    [ -f "$new/frontend/dist/index.html" ] || return 1

    status_step 4 "Backup maken"
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
export RUBRICMAKER_BRANCH="$BRANCH"
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
    touch "$INSTALL_DIR/$MARKER"
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
        # Er wordt al gestart. Wordt er bijgewerkt, toon dan de voortgangspagina opnieuw;
        # anders alleen de browser openen zodra de server er is.
        local busy
        busy="$(status_url)"
        if [ -n "$busy" ]; then open_url "$busy"; exit 0; fi
        for _ in $(seq 1 120); do server_running && break; sleep 1; done
        server_running && open_url "http://127.0.0.1:$(current_port)"
        exit 0
    fi

    local latest update_error=""
    latest="$(latest_version)"
    if [ -n "$latest" ] && [ "$latest" != "$(installed_version)" ]; then
        mkdir -p "$LOG_DIR"
        # Voortgangspagina in de browser; lukt dat niet, dan alleen een melding.
        status_begin || notify "Nieuwe versie gevonden. Rubricmaker wordt bijgewerkt, dit duurt ongeveer een minuut."
        ensure_uv && ensure_node && ensure_venv || true
        stop_server
        if install_version "$latest" >> "$LOG_DIR/install.log" 2>&1; then
            create_mac_app
        else
            rm -rf "$INSTALL_DIR/app.new"
            update_error="Bijwerken is mislukt. Je werkt verder met de vorige versie."
            [ "$STATUS_ACTIVE" = 1 ] || alert "$update_error"
        fi
    fi

    if ! server_running; then
        status_step 5 "Rubricmaker starten"
        daily_backup || true
        stop_server
        if ! start_server; then
            status_finish "" "Rubricmaker start niet."
            alert "Rubricmaker start niet. Zie $LOG_DIR/server.log"
            exit 1
        fi
    fi
    local url="http://127.0.0.1:$(current_port)"
    if [ "$STATUS_ACTIVE" = 1 ]; then
        # De voortgangspagina springt zelf door naar Rubricmaker.
        status_finish "$url" "$update_error"
    else
        open_url "$url"
    fi
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
