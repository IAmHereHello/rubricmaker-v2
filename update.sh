#!/bin/bash
# Update Rubricmaker naar de nieuwste versie van de main branch.
# Dit script wordt ook gebruikt door rubricmaker-update.desktop.
set -e

# Laad nvm zodat npm/node vindbaar zijn vanuit de desktop-launcher
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

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
