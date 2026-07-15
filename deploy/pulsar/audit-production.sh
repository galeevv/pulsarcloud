#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only post-deployment audit. It never sources or prints the environment.
ENV_FILE="${1:-/etc/pulsar/pulsar.env}"
DB_FILE="/var/lib/pulsar/pulsar.db"
CURRENT_RELEASE="/opt/pulsar/current"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$1"
}

for command in awk curl grep nginx openssl readlink ss sqlite3 stat systemctl ufw; do
  command -v "$command" >/dev/null 2>&1 || fail "required command: $command"
done
pass "required commands are installed"

[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || fail "protected environment file"
[[ "$(stat -c '%U:%G' "$ENV_FILE")" == "root:pulsar" ]] ||
  fail "environment ownership"
[[ "$(stat -c '%a' "$ENV_FILE")" == "640" ]] || fail "environment mode"

get_env() {
  local key="$1"
  local line raw="" found=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^[[:space:]]*${key}[[:space:]]*=(.*)$ ]]; then
      raw="${BASH_REMATCH[1]}"
      found=1
    fi
  done <"$ENV_FILE"
  ((found == 1)) || return 1
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  if [[ ${#raw} -ge 2 ]]; then
    if [[ "${raw:0:1}" == "'" && "${raw: -1}" == "'" ]] ||
      [[ "${raw:0:1}" == '"' && "${raw: -1}" == '"' ]]; then
      raw="${raw:1:${#raw}-2}"
    fi
  fi
  printf '%s' "$raw"
}

expect_env() {
  local key="$1" expected="$2" actual
  actual="$(get_env "$key")" || fail "environment invariant: $key"
  [[ "$actual" == "$expected" ]] || fail "environment invariant: $key"
}

require_env() {
  local key="$1" minimum="${2:-1}" value
  value="$(get_env "$key")" || fail "required environment value: $key"
  ((${#value} >= minimum)) || fail "required environment value: $key"
}

expect_env APP_ENV production
expect_env APP_URL https://pulsar-cloud.space
expect_env DATABASE_URL file:/var/lib/pulsar/pulsar.db
expect_env PULSAR_TEST_MODE false
expect_env PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION false
expect_env PAYMENT_PROVIDER platega
expect_env BILLING_ENABLED false
expect_env REMNAWAVE_PROVIDER http
expect_env REMNAWAVE_BASE_URL https://panel.pulsar-cloud.space

require_env SESSION_SECRET 32
require_env AUTH_PEPPER 32
require_env DATA_ENCRYPTION_KEY 64
require_env RESEND_API_KEY 8
require_env RESEND_FROM_EMAIL 3
require_env TELEGRAM_BOT_TOKEN 8
require_env TELEGRAM_BOT_USERNAME 1
require_env TELEGRAM_WEBHOOK_SECRET 16
require_env ADMIN_EMAIL 3
require_env ADMIN_TELEGRAM_ID 1
require_env PAYMENT_WEBHOOK_SECRET 16
require_env PLATEGA_MERCHANT_ID 1
platega_secret="$(get_env PLATEGA_SECRET 2>/dev/null || true)"
platega_api_key="$(get_env PLATEGA_API_KEY 2>/dev/null || true)"
[[ -n "$platega_secret" || -n "$platega_api_key" ]] ||
  fail "required Platega credential"
unset platega_secret platega_api_key
require_env REMNAWAVE_API_TOKEN 16
require_env REMNAWAVE_STANDARD_SQUAD_UUID 36
require_env REMNAWAVE_LTE_SQUAD_UUID 36

data_key="$(get_env DATA_ENCRYPTION_KEY)"
[[ "$data_key" =~ ^[a-fA-F0-9]{64}$ ]] || fail "data encryption key format"
session_secret="$(get_env SESSION_SECRET)"
auth_pepper="$(get_env AUTH_PEPPER)"
[[ "$session_secret" != "$auth_pepper" ]] || fail "independent auth secrets"
[[ "$session_secret" != "$data_key" && "$auth_pepper" != "$data_key" ]] ||
  fail "independent auth secrets"
unset data_key session_secret auth_pepper
pass "production environment invariants"

[[ -f "$DB_FILE" && ! -L "$DB_FILE" ]] || fail "SQLite database file"
[[ "$(readlink -f "$DB_FILE")" == "$DB_FILE" ]] || fail "canonical database path"
[[ "$(stat -c '%U:%G' "$DB_FILE")" == "pulsar:pulsar" ]] ||
  fail "database ownership"
[[ "$(stat -c '%a' "$DB_FILE")" == "600" ]] || fail "database mode"
[[ "$(sqlite3 "$DB_FILE" 'PRAGMA quick_check;' 2>/dev/null)" == "ok" ]] ||
  fail "SQLite quick check"
pass "SQLite integrity and permissions"

[[ -L "$CURRENT_RELEASE" ]] || fail "atomic current release symlink"
release_target="$(readlink -f "$CURRENT_RELEASE")"
[[ "$release_target" == /opt/pulsar/releases/* ]] || fail "current release target"
[[ -f "$release_target/.next/standalone/server.js" ]] || fail "standalone web artifact"
[[ -f "$release_target/src/jobs/worker.ts" ]] || fail "worker artifact"
if find "$release_target" -xdev \( -type f -o -type d \) -perm -0002 \
  -print -quit | grep -q .; then
  fail "release contains world-writable files or directories"
fi
pass "immutable release layout"

nginx -t >/dev/null 2>&1 || fail "Nginx configuration"
for unit in nginx pulsar-web pulsar-worker pulsar-backup.timer docker; do
  systemctl is-active --quiet "$unit" || fail "active systemd unit: $unit"
done
systemctl is-enabled --quiet pulsar-backup.timer || fail "enabled backup timer"
pass "systemd services and Nginx"

check_loopback_port() {
  local port="$1" address found=0
  while IFS= read -r address; do
    [[ -n "$address" ]] || continue
    case "$address" in
      "127.0.0.1:$port" | "[::1]:$port" | "::1:$port") found=1 ;;
      *) fail "loopback-only listener on port $port" ;;
    esac
  done < <(
    ss -H -ltn | awk -v suffix=":$port" \
      'length($4) >= length(suffix) && substr($4, length($4)-length(suffix)+1) == suffix { print $4 }'
  )
  ((found == 1)) || fail "required listener on port $port"
}

for port in 3000 3010 3020 3021 6767; do
  check_loopback_port "$port"
done

if ss -H -ltn | awk '
  {
    address=$4
    if (address ~ /^127\./ || address ~ /^\[::1\]:/ || address ~ /^::1:/) next
    port=address
    sub(/^.*:/, "", port)
    if (port != "22" && port != "80" && port != "443") exit 1
  }
'; then
  :
else
  fail "public TCP listener allowlist"
fi
pass "loopback and public listener policy"

ufw_status="$(ufw status)"
grep -q '^Status: active$' <<<"$ufw_status" || fail "UFW active"
ssh_rule=0
web_rule=0
while IFS= read -r rule; do
  case "$rule" in
    *22/tcp* | *OpenSSH*) ssh_rule=1 ;;
    *80/tcp* | *443/tcp* | *"Nginx Full"*) web_rule=1 ;;
    *) fail "UFW inbound allowlist" ;;
  esac
done < <(
  grep -E '[[:space:]](ALLOW|LIMIT)[[:space:]]' <<<"$ufw_status" || true
)
((ssh_rule == 1 && web_rule == 1)) || fail "UFW required service rules"
unset ufw_status
pass "UFW inbound policy"

certificate=/etc/letsencrypt/live/pulsar-cloud.space/fullchain.pem
[[ -r "$certificate" ]] || fail "TLS certificate"
openssl x509 -checkend 604800 -noout -in "$certificate" >/dev/null 2>&1 ||
  fail "TLS certificate seven-day validity"

curl -fsS --max-time 10 http://127.0.0.1:3000/api/health/live >/dev/null ||
  fail "local Pulsar liveness"
curl -fsS --max-time 10 \
  -H 'Host: panel.pulsar-cloud.space' \
  -H 'X-Real-IP: 127.0.0.1' \
  -H 'X-Forwarded-For: 127.0.0.1' \
  -H 'X-Forwarded-Proto: https' \
  -H 'Connection: close' \
  http://127.0.0.1:3020/api/auth/status >/dev/null ||
  fail "local Remnawave Panel"
curl -fsS --max-time 10 \
  --resolve sub.pulsar-cloud.space:443:127.0.0.1 \
  https://sub.pulsar-cloud.space/ >/dev/null ||
  fail "local subscription page"

ready_json="$(curl -fsS --max-time 15 https://pulsar-cloud.space/api/health/ready)" ||
  fail "public Pulsar readiness"
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ready"' <<<"$ready_json" ||
  fail "public readiness state"
grep -Eq '"billingEnabled"[[:space:]]*:[[:space:]]*false' <<<"$ready_json" ||
  fail "billing remains disabled"
unset ready_json

curl -fsS --max-time 15 https://panel.pulsar-cloud.space/api/auth/status >/dev/null ||
  fail "public Remnawave Panel"
curl -fsSI --max-time 15 https://sub.pulsar-cloud.space/ >/dev/null ||
  fail "public subscription hostname"

headers="$(curl -fsSI --max-time 15 https://pulsar-cloud.space/)" ||
  fail "public response headers"
grep -Eqi '^content-security-policy:.*frame-ancestors[[:space:]]+[^;]*none' <<<"$headers" ||
  fail "CSP frame-ancestors"
grep -Eqi '^x-frame-options:[[:space:]]*DENY' <<<"$headers" ||
  fail "X-Frame-Options"
grep -Eqi '^strict-transport-security:' <<<"$headers" || fail "HSTS"
unset headers
pass "TLS, health endpoints, billing lock, and security headers"

printf 'Production audit completed without changing server state.\n'
