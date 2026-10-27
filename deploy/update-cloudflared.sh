#!/bin/bash
# Update cloudflared (the Cloudflare Tunnel program) on the Raspberry Pi
# to the latest release and restart the tunnel.
#
# Run this ON THE RASPBERRY PI:  bash ~/rubricgrader/deploy/update-cloudflared.sh
# The tunnel is down for a few seconds during the restart.
set -e

echo "=== cloudflared updaten ==="
echo "Huidige versie: $(cloudflared --version)"

ARCH=$(dpkg --print-architecture)
curl -fL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb
rm /tmp/cloudflared.deb

sudo systemctl restart cloudflared
sleep 5

echo ""
echo "Nieuwe versie: $(cloudflared --version)"
systemctl is-active --quiet cloudflared && echo "Tunnel draait weer." || echo "LET OP: cloudflared draait niet. Check: sudo systemctl status cloudflared"
