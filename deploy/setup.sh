#!/bin/bash
# Eenmalig setup-script voor Rubricmaker op de Raspberry Pi.
# Aanpassen: PROJECT_DIR als je het project ergens anders hebt staan.
set -e

PROJECT_DIR="/home/michael/rubricgrader"

echo "=== Rubricmaker setup ==="
echo ""

# Python virtual environment
if [ ! -d "$PROJECT_DIR/.venv" ]; then
    echo "[1/6] Python virtual environment aanmaken..."
    python3 -m venv "$PROJECT_DIR/.venv"
else
    echo "[1/6] .venv bestaat al, overslaan."
fi

echo "[2/6] Python dependencies installeren..."
"$PROJECT_DIR/.venv/bin/pip" install --quiet -r "$PROJECT_DIR/backend/requirements.txt"

echo "[3/6] Frontend bouwen..."
cd "$PROJECT_DIR/frontend"
npm install --silent
npm run build
cd "$PROJECT_DIR"

echo "[4/6] Backend systemd-service installeren..."
sudo cp "$PROJECT_DIR/deploy/rubricmaker-api.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable rubricmaker-api
sudo systemctl start rubricmaker-api

echo "[5/6] nginx installeren en configureren..."
sudo apt-get install -y nginx
sudo cp "$PROJECT_DIR/deploy/nginx-rubricmaker.conf" /etc/nginx/sites-available/rubricmaker
sudo ln -sf /etc/nginx/sites-available/rubricmaker /etc/nginx/sites-enabled/rubricmaker
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "[6/6] Snelkoppeling op bureaublad plaatsen..."
chmod +x "$PROJECT_DIR/update.sh"
cp "$PROJECT_DIR/rubricmaker-update.desktop" ~/Desktop/
chmod +x ~/Desktop/rubricmaker-update.desktop

echo ""
echo "=== Setup voltooid ==="
echo "De app is bereikbaar via Tailscale op poort 3000."
echo ""
echo "Controleer de status:"
echo "  sudo systemctl status rubricmaker-api"
echo "  sudo systemctl status nginx"
