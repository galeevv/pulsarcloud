#!/usr/bin/env bash
# Install / update a Remnawave Node on a traffic or origin VPS.
# Idempotent. Requires Docker (install-docker.sh) first.
#
# The node certificate is provided out-of-band (created in the panel) and must
# never be committed. Provide it via env or an existing /opt/remnanode/.env.
#
# Required env (first install only):
#   SECRET_KEY     panel secret (GET /api/keygen -> pubKey; same for every node)
# Optional env:
#   NODE_PORT      port the panel connects to (default 2222)
#   NODE_DIR       install dir (default /opt/remnanode)
#
# Usage:
#   sudo SECRET_KEY='<paste>' ./install-remnanode.sh
set -Eeuo pipefail
cd "$(dirname "$0")"
. ./lib.sh

require_root
need_cmd docker
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin missing (run install-docker.sh)."

NODE_DIR="${NODE_DIR:-/opt/remnanode}"
NODE_PORT="${NODE_PORT:-2222}"
SRC_DIR="$(cd .. && pwd)/remnanode"

install -d -m 0750 "$NODE_DIR"
cp -f "$SRC_DIR/docker-compose.yml" "$NODE_DIR/docker-compose.yml"

if [ ! -f "$NODE_DIR/.env" ]; then
  require_var SECRET_KEY
  umask 077
  {
    printf 'NODE_PORT=%s\n' "$NODE_PORT"
    printf 'SECRET_KEY=%s\n' "$SECRET_KEY"
  } > "$NODE_DIR/.env"
  chmod 0600 "$NODE_DIR/.env"
  ok "Wrote $NODE_DIR/.env (0600)."
else
  ok "$NODE_DIR/.env already present — keeping existing certificate."
fi

log "Validating compose configuration..."
( cd "$NODE_DIR" && docker compose config >/dev/null ) || die "docker compose config invalid."

log "Pulling and starting remnanode..."
( cd "$NODE_DIR" && docker compose pull && docker compose up -d )

sleep 3
( cd "$NODE_DIR" && docker compose ps )
ok "Remnawave node up. Verify it shows ONLINE in the panel."
log "Node port ${NODE_PORT} must be reachable from the panel IP only (configure-firewall.sh)."
