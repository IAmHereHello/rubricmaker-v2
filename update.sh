#!/bin/bash
# Update Rubricmaker naar de nieuwste versie van de main branch.
# Dit script wordt ook gebruikt door rubricmaker-update.desktop.
set -e

# Zorg dat npm/node vindbaar zijn als het script vanuit de desktop-launcher draait
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Rubricmaker updater ==="
echo ""

echo "[1/3] Nieuwste code ophalen van GitHub..."
git pull --autostash origin main

echo ""
echo "[2/3] Frontend bouwen..."
cd frontend
npm install --silent
npm run build
cd "$SCRIPT_DIR"

echo ""
echo "[3/3] Backend herstarten..."
sudo systemctl restart rubricmaker-api
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "Klaar! Rubricmaker is bijgewerkt."
