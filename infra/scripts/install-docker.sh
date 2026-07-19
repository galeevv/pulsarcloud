#!/usr/bin/env bash
# Install Docker Engine + Compose plugin from Docker's official apt repo.
# Idempotent: no-op if docker is already present.
set -Eeuo pipefail
cd "$(dirname "$0")"
. ./lib.sh

require_root

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "Docker + Compose already installed: $(docker --version)"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
. /etc/os-release

log "Adding Docker apt repository..."
install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.asc ]; then
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi

# Docker may not yet publish a component for very new Ubuntu codenames.
# Probe, and fall back to the latest LTS repo (forward-compatible) if missing.
CODENAME="${VERSION_CODENAME}"
if ! curl -fsSL "https://download.docker.com/linux/${ID}/dists/${CODENAME}/Release" >/dev/null 2>&1; then
  FALLBACK="${DOCKER_CODENAME_FALLBACK:-noble}"
  warn "Docker has no repo for '${CODENAME}'; falling back to '${FALLBACK}'."
  CODENAME="$FALLBACK"
fi
cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${CODENAME} stable
EOF

log "Installing Docker Engine and Compose plugin..."
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker >/dev/null 2>&1 || warn "docker service not enabled."
ok "Installed: $(docker --version); $(docker compose version)"
