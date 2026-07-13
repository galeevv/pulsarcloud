#!/usr/bin/env bash
set -euo pipefail
umask 077

panel_url=https://panel.pulsar-cloud.space
credentials_file=/root/remnawave-initial-admin.txt
pulsar_env=/etc/pulsar/pulsar.env
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
completion_marker=/opt/remnawave/.pulsar-bootstrap-complete

bootstrap_entitlements() {
  local script="$script_dir/bootstrap-test-entitlements.sh"
  [[ -x "$script" || -f "$script" ]] || {
    echo "Missing Remnawave entitlement bootstrap: $script" >&2
    return 1
  }
  bash "$script"
}

if [[ -f "$completion_marker" && -f /opt/remnawave/subscription/.env ]]; then
  echo "Remnawave bootstrap already completed"
  bootstrap_entitlements
  exit 0
fi

status="$(curl -fsS "$panel_url/api/auth/status")"
if [[ "$(jq -r '.response.isRegisterAllowed' <<<"$status")" == true ]]; then
  username=galeev66
  password="Aa1-$(openssl rand -hex 24)"
  register_payload="$(jq -nc \
    --arg username "$username" \
    --arg password "$password" \
    '{username: $username, password: $password}')"
  register_response="$(curl -fsS \
    -H 'Content-Type: application/json' \
    --data "$register_payload" \
    "$panel_url/api/auth/register")"
  access_token="$(jq -er '.response.accessToken' <<<"$register_response")"

  install -o root -g root -m 0600 /dev/stdin "$credentials_file" <<EOF
URL=${panel_url}
USERNAME=${username}
PASSWORD=${password}
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  unset password register_payload register_response
elif [[ -f "$credentials_file" ]]; then
  username="$(sed -n 's/^USERNAME=//p' "$credentials_file")"
  password="$(sed -n 's/^PASSWORD=//p' "$credentials_file")"
  login_payload="$(jq -nc \
    --arg username "$username" \
    --arg password "$password" \
    '{username: $username, password: $password}')"
  login_response="$(curl -fsS \
    -H 'Content-Type: application/json' \
    --data "$login_payload" \
    "$panel_url/api/auth/login")"
  access_token="$(jq -er '.response.accessToken' <<<"$login_response")"
  unset password login_payload login_response
else
  echo "Panel is already registered and no bootstrap credentials are available" >&2
  exit 1
fi

create_api_token() {
  local name="$1"
  local payload response response_file status
  payload="$(jq -nc --arg name "$name" '{name: $name, expiresInDays: 365}')"
  response_file="$(mktemp)"
  status="$(curl -sS -o "$response_file" -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -H 'X-Remnawave-Client-Type: browser' \
    -H "Authorization: Bearer ${access_token}" \
    --data "$payload" \
    "$panel_url/api/tokens/")"
  if [[ "$status" != 201 ]]; then
    printf 'API token creation failed for %s (HTTP %s): ' "$name" "$status" >&2
    jq -c 'del(.response.token)' "$response_file" >&2 || printf 'invalid JSON response\n' >&2
    rm -f "$response_file"
    return 1
  fi
  response="$(<"$response_file")"
  rm -f "$response_file"
  jq -er '.response.token' <<<"$response"
}

pulsar_token="$(create_api_token pulsar-backend)"
subscription_token="$(create_api_token subscription-page)"
unset access_token

if grep -q '^REMNAWAVE_API_TOKEN=' "$pulsar_env"; then
  sed -i "s#^REMNAWAVE_API_TOKEN=.*#REMNAWAVE_API_TOKEN=${pulsar_token}#" "$pulsar_env"
else
  printf 'REMNAWAVE_API_TOKEN=%s\n' "$pulsar_token" >> "$pulsar_env"
fi
chown root:pulsar "$pulsar_env"
chmod 0640 "$pulsar_env"
unset pulsar_token

install -d -o root -g root -m 0700 /opt/remnawave/subscription
install -o root -g root -m 0600 \
  "$script_dir/subscription-compose.yml" \
  /opt/remnawave/subscription/docker-compose.yml
install -o root -g root -m 0600 /dev/stdin /opt/remnawave/subscription/.env <<EOF
APP_PORT=3010
REMNAWAVE_PANEL_URL=http://remnawave:3000
REMNAWAVE_API_TOKEN=${subscription_token}
TRUST_PROXY=1
EOF
unset subscription_token

cd /opt/remnawave/subscription
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps

bootstrap_entitlements
install -o root -g root -m 0600 /dev/null "$completion_marker"

echo "Remnawave admin and integration tokens bootstrapped"
