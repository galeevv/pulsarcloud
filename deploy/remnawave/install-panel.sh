#!/usr/bin/env bash
set -euo pipefail
umask 077

install -d -o root -g root -m 0700 /opt/remnawave
cd /opt/remnawave

curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/remnawave/backend/refs/heads/main/docker-compose-prod.yml
curl -fsSL -o .env \
  https://raw.githubusercontent.com/remnawave/backend/refs/heads/main/.env.sample
chmod 0600 .env docker-compose.yml

# Pulsar owns 127.0.0.1:3000. Keep every Remnawave port on loopback.
sed -i 's#127.0.0.1:3000:${APP_PORT:-3000}#127.0.0.1:3020:${APP_PORT:-3000}#' docker-compose.yml
sed -i 's#127.0.0.1:3001:${METRICS_PORT:-3001}#127.0.0.1:3021:${METRICS_PORT:-3001}#' docker-compose.yml
sed -i 's/max-size: 100m/max-size: 10m/; s/max-file: 5/max-file: 3/' docker-compose.yml

set_env() {
  local name="$1"
  local value="$2"
  if grep -q "^${name}=" .env; then
    sed -i "s#^${name}=.*#${name}=${value}#" .env
  else
    printf '%s=%s\n' "$name" "$value" >> .env
  fi
}

set_env API_INSTANCES 1
set_env PANEL_DOMAIN panel.pulsar-cloud.space
set_env FRONT_END_DOMAIN panel.pulsar-cloud.space
set_env SUB_PUBLIC_DOMAIN sub.pulsar-cloud.space
set_env JWT_AUTH_SECRET "$(openssl rand -hex 64)"
set_env JWT_API_TOKENS_SECRET "$(openssl rand -hex 64)"
set_env METRICS_PASS "$(openssl rand -hex 64)"
set_env WEBHOOK_SECRET_HEADER "$(openssl rand -hex 32)"

postgres_password="$(openssl rand -hex 24)"
set_env POSTGRES_PASSWORD "$postgres_password"
sed -i \
  "s#^DATABASE_URL=.*#DATABASE_URL=\"postgresql://postgres:${postgres_password}@remnawave-db:5432/postgres\"#" \
  .env
unset postgres_password

docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps

