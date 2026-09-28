#!/bin/bash
# One-time setup for Cloudflare Tunnel + Access in front of Rubricmaker.
#
# Run this ON THE RASPBERRY PI, after you have:
#   1. Registered a domain and added it to a (free) Cloudflare account,
#      with Cloudflare set as the domain's DNS.
#   2. Picked a subdomain to use, e.g. rubric.yourdomain.nl
#
# This script only opens an OUTGOING connection from the Pi to Cloudflare.
# It does not open any inbound port, and does not touch the existing
# Tailscale/nginx setup on port 443 — that keeps working alongside this.
#
# Usage: ./setup-cloudflare-tunnel.sh rubric.yourdomain.nl
set -e

DOMAIN="$1"
if [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <subdomain, e.g. rubric.yourdomain.nl>"
    exit 1
fi

PROJECT_DIR="/home/michael/rubricgrader"
LOCAL_PORT=8080
TUNNEL_NAME="rubricmaker"

echo "=== Cloudflare Tunnel setup for $DOMAIN ==="
echo ""

echo "[1/6] cloudflared installeren..."
if ! command -v cloudflared >/dev/null 2>&1; then
    ARCH=$(dpkg --print-architecture)
    curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -o /tmp/cloudflared.deb
    sudo dpkg -i /tmp/cloudflared.deb
    rm /tmp/cloudflared.deb
else
    echo "cloudflared is al geinstalleerd, overslaan."
fi

echo ""
echo "[2/6] Inloggen bij Cloudflare..."
echo "Dit print een link. Open die in een browser en kies je domein."
cloudflared tunnel login

echo ""
echo "[3/6] Tunnel aanmaken..."
if ! cloudflared tunnel list | awk '{print $2}' | grep -qx "$TUNNEL_NAME"; then
    cloudflared tunnel create "$TUNNEL_NAME"
else
    echo "Tunnel '$TUNNEL_NAME' bestaat al, overslaan."
fi
TUNNEL_ID=$(cloudflared tunnel list | awk -v n="$TUNNEL_NAME" '$2==n {print $1}')
echo "Tunnel ID: $TUNNEL_ID"

echo ""
echo "[4/6] DNS-record aanmaken voor $DOMAIN..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN"

echo ""
echo "[5/6] Tunnel-config wegschrijven naar /etc/cloudflared/config.yml..."
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml > /dev/null <<EOF
tunnel: $TUNNEL_ID
credentials-file: /home/michael/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:$LOCAL_PORT
  - service: http_status:404
EOF

echo ""
echo "[6/6] nginx-block en cloudflared-service installeren..."
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/" "$PROJECT_DIR/deploy/nginx-cloudflare.conf" | sudo tee /etc/nginx/sites-available/rubricmaker-cloudflare > /dev/null
sudo ln -sf /etc/nginx/sites-available/rubricmaker-cloudflare /etc/nginx/sites-enabled/rubricmaker-cloudflare
sudo nginx -t
sudo systemctl reload nginx

sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared

echo ""
echo "=== Klaar met het technische deel ==="
echo ""
echo "Laatste stap moet je handmatig doen in het Cloudflare Zero Trust dashboard"
echo "(https://one.dash.cloudflare.com/ -> Access -> Applications -> Add an application -> Self-hosted):"
echo "  - Application domain: $DOMAIN"
echo "  - Policy action: Allow"
echo "  - Include rule: Emails -> jouw e-mailadres (en eventueel die van collega's)"
echo ""
echo "Test daarna: https://$DOMAIN"
echo "Status checken:"
echo "  sudo systemctl status cloudflared"
echo "  sudo cloudflared tunnel info $TUNNEL_NAME"
