#!/usr/bin/env bash
# Role-based UFW firewall for Pulsar traffic/origin nodes.
# Never disables the firewall; opens only the minimum ports per role.
#
# Required env:
#   ROLE       one of: reality | hysteria | lte-origin
#   PANEL_IP   management panel IP allowed to reach the node admin port
#              (Pulsar panel = 31.76.27.41 — NOT the LTE origin 144.31.156.x)
# Optional env:
#   NODE_API_PORT   Remnawave node <-> panel port (default 2222)
#   ADMIN_IP        extra admin IP allowed to SSH (default: anywhere, rate-limited)
#
# Usage:
#   sudo ROLE=reality  PANEL_IP=31.76.27.41 ./configure-firewall.sh
#   sudo ROLE=hysteria PANEL_IP=31.76.27.41 ./configure-firewall.sh
#   sudo ROLE=lte-origin PANEL_IP=31.76.27.41 ./configure-firewall.sh
set -Eeuo pipefail
cd "$(dirname "$0")"
. ./lib.sh

require_root
need_cmd ufw
require_var ROLE
require_var PANEL_IP
NODE_API_PORT="${NODE_API_PORT:-2222}"

log "Configuring UFW for role=$ROLE (panel=$PANEL_IP, node-api=$NODE_API_PORT)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing

# SSH — rate-limited, optionally restricted to an admin IP.
if [ -n "${ADMIN_IP:-}" ]; then
  ufw allow from "$ADMIN_IP" to any port 22 proto tcp
else
  ufw limit 22/tcp
fi

# Node <-> Panel admin/data port: only from the panel.
ufw allow from "$PANEL_IP" to any port "$NODE_API_PORT" proto tcp

case "$ROLE" in
  reality)
    # VLESS RAW TCP Reality — public 443/tcp. No ACME needed (Reality steals SNI).
    ufw allow 443/tcp
    ;;
  hysteria)
    # Hysteria2 — public 443/udp. 80/tcp allowed for ACME http-01 cert issuance/renewal.
    ufw allow 443/udp
    ufw allow 80/tcp
    ;;
  lte-origin)
    # Yandex CDN origin — 443/tcp from CDN edge (nginx TLS). 80/tcp for ACME.
    # Locking to Yandex edge ranges is done later once the CDN resource exists;
    # keep 443 open initially so cert issuance and origin health work.
    ufw allow 80/tcp
    ufw allow 443/tcp
    ;;
  *)
    die "Unknown ROLE: $ROLE (expected reality|hysteria|lte-origin)"
    ;;
esac

ufw --force enable
echo
ok "Firewall active for role=$ROLE:"
ufw status verbose | sed 's/^/  /'
