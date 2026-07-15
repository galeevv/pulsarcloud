#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ENV_FILE="${1:-/etc/pulsar/pulsar.env}"
TEST_DB="${2:-/var/lib/pulsar/pulsar-vps-test.db}"

[[ "$(id -u)" == "0" ]] || {
  echo "Run as root" >&2
  exit 1
}
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || {
  echo "Protected Pulsar environment file is missing or unsafe" >&2
  exit 1
}

for key in \
  SESSION_SECRET AUTH_PEPPER DATA_ENCRYPTION_KEY RESEND_API_KEY \
  TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME TELEGRAM_WEBHOOK_SECRET \
  REMNAWAVE_API_TOKEN REMNAWAVE_STANDARD_SQUAD_UUID \
  REMNAWAVE_LTE_SQUAD_UUID; do
  grep -Eq "^${key}=.+" "$ENV_FILE" || {
    echo "Required test deployment setting is missing: $key" >&2
    exit 1
  }
done

case "$(basename "$TEST_DB")" in
  test.db | *.test.db | test-*.db | *-test.db) ;;
  *)
    echo "Test database filename must be explicitly marked as test" >&2
    exit 1
    ;;
esac

backup="${ENV_FILE}.before-vps-test.$(date -u +%Y%m%dT%H%M%SZ)"
install -o root -g pulsar -m 0640 "$ENV_FILE" "$backup"

rollback_env() {
  install -o root -g pulsar -m 0640 "$backup" "$ENV_FILE"
  echo "Environment update failed; restored $backup" >&2
}
trap rollback_env ERR

upsert_env() {
  local key="$1" value="$2" temporary
  temporary="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    index($0, key "=") == 1 {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END { if (!replaced) print key "=" value }
  ' "$ENV_FILE" >"$temporary"
  install -o root -g pulsar -m 0640 "$temporary" "$ENV_FILE"
  rm -f "$temporary"
}

if [[ ! -e "$TEST_DB" ]]; then
  install -o pulsar -g pulsar -m 0600 /dev/null "$TEST_DB"
fi
[[ -f "$TEST_DB" && ! -L "$TEST_DB" ]] || {
  echo "Test database must be a regular non-symlink file" >&2
  exit 1
}
chown pulsar:pulsar "$TEST_DB"
chmod 0600 "$TEST_DB"

upsert_env APP_ENV production
upsert_env APP_URL https://pulsar-cloud.space
upsert_env DATABASE_URL "file:${TEST_DB}"
upsert_env PAYMENT_PROVIDER test
upsert_env BILLING_ENABLED false
upsert_env REMNAWAVE_PROVIDER http
upsert_env REMNAWAVE_USER_NAMESPACE pulsar_vps_test
upsert_env REMNAWAVE_BASE_URL https://panel.pulsar-cloud.space
upsert_env PULSAR_TEST_MODE true
upsert_env PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION true
upsert_env PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE true

trap - ERR

echo "VPS test mode enabled with an isolated database and Remnawave namespace."
echo "Environment backup: $backup"
