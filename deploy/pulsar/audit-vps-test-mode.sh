#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${1:-/etc/pulsar/pulsar.env}"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$1"
}

for command in awk curl grep jq nginx readlink ss sqlite3 stat systemctl ufw; do
  command -v "$command" >/dev/null 2>&1 || fail "required command: $command"
done
pass "required commands are installed"

get_env() {
  local key="$1" raw
  raw="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"
  raw="${raw%$'\r'}"
  if [[ ${#raw} -ge 2 ]]; then
    if [[ "${raw:0:1}" == "'" && "${raw: -1}" == "'" ]] ||
      [[ "${raw:0:1}" == '"' && "${raw: -1}" == '"' ]]; then
      raw="${raw:1:${#raw}-2}"
    fi
  fi
  printf '%s' "$raw"
}

expect_env() {
  local key="$1" expected="$2"
  [[ "$(get_env "$key")" == "$expected" ]] ||
    fail "environment invariant: $key"
}

require_env() {
  local key="$1" minimum="${2:-1}" value
  value="$(get_env "$key")"
  ((${#value} >= minimum)) || fail "required setting: $key"
}

[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || fail "protected env file"
[[ "$(stat -c '%U:%G %a' "$ENV_FILE")" == "root:pulsar 640" ]] ||
  fail "protected env ownership/mode"

expect_env APP_ENV production
expect_env APP_URL https://pulsar-cloud.space
expect_env DATABASE_URL file:/var/lib/pulsar/pulsar-vps-test.db
expect_env PAYMENT_PROVIDER test
expect_env BILLING_ENABLED false
expect_env PULSAR_TEST_MODE true
expect_env PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION true
expect_env PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE true
expect_env REMNAWAVE_PROVIDER http
expect_env REMNAWAVE_USER_NAMESPACE pulsar_vps_test
expect_env REMNAWAVE_BASE_URL https://panel.pulsar-cloud.space

for key in \
  SESSION_SECRET AUTH_PEPPER DATA_ENCRYPTION_KEY RESEND_API_KEY \
  RESEND_FROM_EMAIL TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME \
  TELEGRAM_WEBHOOK_SECRET REMNAWAVE_API_TOKEN \
  REMNAWAVE_STANDARD_SQUAD_UUID REMNAWAVE_LTE_SQUAD_UUID; do
  require_env "$key"
done
pass "isolated VPS test environment"

DB_FILE=/var/lib/pulsar/pulsar-vps-test.db
[[ -f "$DB_FILE" && ! -L "$DB_FILE" ]] || fail "test SQLite file"
[[ "$(stat -c '%U:%G %a' "$DB_FILE")" == "pulsar:pulsar 600" ]] ||
  fail "test SQLite ownership/mode"
[[ "$(sqlite3 "$DB_FILE" 'PRAGMA quick_check;' 2>/dev/null)" == "ok" ]] ||
  fail "test SQLite integrity"
pass "test SQLite integrity and isolation"

[[ -L /opt/pulsar/current ]] || fail "atomic current release"
release="$(readlink -f /opt/pulsar/current)"
[[ "$release" == /opt/pulsar/releases/* ]] || fail "release target"
[[ -f "$release/.next/standalone/server.js" ]] || fail "web artifact"
[[ -f "$release/src/jobs/worker.ts" ]] || fail "worker artifact"
pass "release artifacts"

nginx -t >/dev/null 2>&1 || fail "Nginx config"
for unit in nginx pulsar-web pulsar-worker docker; do
  systemctl is-active --quiet "$unit" || fail "active service: $unit"
done

check_loopback_port() {
  local port="$1" address found=0
  while IFS= read -r address; do
    [[ -n "$address" ]] || continue
    case "$address" in
      "127.0.0.1:$port" | "[::1]:$port" | "::1:$port") found=1 ;;
      *) fail "non-loopback listener on protected port $port" ;;
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

if ! ss -H -ltn | awk '
  {
    address=$4
    if (address ~ /^127\./ || address ~ /^\[::1\]:/ || address ~ /^::1:/) next
    port=address
    sub(/^.*:/, "", port)
    if (port != "22" && port != "80" && port != "443") exit 1
  }
'; then
  fail "public TCP listener allowlist"
fi

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
done < <(grep -E '[[:space:]](ALLOW|LIMIT)[[:space:]]' <<<"$ufw_status" || true)
((ssh_rule == 1 && web_rule == 1)) || fail "UFW required service rules"
unset ufw_status
pass "services, listeners, and UFW policy"

ready="$(curl -fsS --max-time 15 https://pulsar-cloud.space/api/health/ready)" ||
  fail "public readiness"
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ready"' <<<"$ready" ||
  fail "ready status"
curl -fsS --max-time 15 https://panel.pulsar-cloud.space/api/auth/status >/dev/null ||
  fail "Panel endpoint"
curl -fsSI --max-time 15 https://sub.pulsar-cloud.space/ >/dev/null ||
  fail "subscription endpoint"
pass "public endpoints"

panel_url="$(get_env REMNAWAVE_BASE_URL)"
api_token="$(get_env REMNAWAVE_API_TOKEN)"
standard_squad="$(get_env REMNAWAVE_STANDARD_SQUAD_UUID)"
lte_squad="$(get_env REMNAWAVE_LTE_SQUAD_UUID)"
authorization="Authorization: Bearer $api_token"

profiles="$(curl -fsS --max-time 15 -H "$authorization" \
  "$panel_url/api/config-profiles")" || fail "Remnawave config profiles"
squads="$(curl -fsS --max-time 15 -H "$authorization" \
  "$panel_url/api/internal-squads")" || fail "Remnawave internal squads"
nodes="$(curl -fsS --max-time 15 -H "$authorization" \
  "$panel_url/api/nodes")" || fail "Remnawave nodes"

assert_fixture() {
  local profile_name="$1" inbound_tag="$2" port="$3" squad_uuid="$4" inbound_uuid
  jq -e \
    --arg profile "$profile_name" \
    --arg tag "$inbound_tag" \
    --argjson port "$port" '
      any(.response.configProfiles[];
        .name == $profile and
        (.nodes | length) == 0 and
        any(.config.inbounds[];
          .tag == $tag and .listen == "127.0.0.1" and .port == $port
        ) and
        any(.config.outbounds[];
          .tag == "BLOCK" and .protocol == "blackhole"
        ) and
        any(.config.routing.rules[];
          .outboundTag == "BLOCK" and any(.inboundTag[]; . == $tag)
        )
      )
    ' <<<"$profiles" >/dev/null || fail "safe fixture profile: $profile_name"
  inbound_uuid="$(jq -er --arg profile "$profile_name" --arg tag "$inbound_tag" '
    .response.configProfiles[] |
    select(.name == $profile) |
    .inbounds[] |
    select(.tag == $tag) |
    .uuid
  ' <<<"$profiles")" || fail "fixture inbound UUID: $profile_name"
  jq -e --arg squad "$squad_uuid" --arg inbound "$inbound_uuid" '
    any(.response.internalSquads[];
      .uuid == $squad and any(.inbounds[]; .uuid == $inbound)
    )
  ' <<<"$squads" >/dev/null || fail "fixture squad: $profile_name"
}

assert_fixture PULSAR_TEST_STANDARD_PROFILE PULSAR_TEST_STANDARD 65530 "$standard_squad"
assert_fixture PULSAR_TEST_LTE_PROFILE PULSAR_TEST_LTE 65531 "$lte_squad"
jq -e '
  if (.response | type) == "array" then
    (.response | length) == 0
  else
    (.response.nodes | length) == 0
  end
' <<<"$nodes" >/dev/null || fail "management VPS must not have Remnawave Nodes"
unset api_token authorization profiles squads nodes
pass "blackhole entitlement fixtures and no traffic Node"

printf 'VPS test-mode audit completed without printing secrets.\n'
