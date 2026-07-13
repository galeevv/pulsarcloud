#!/usr/bin/env bash
set -euo pipefail
umask 077

input="${1:-}"
target=/etc/pulsar/pulsar.env

install -d -o root -g pulsar -m 0750 /etc/pulsar
if [[ ! -f "$target" ]]; then
  [[ -n "$input" && -f "$input" ]] || {
    echo "An initial production env input file is required" >&2
    exit 2
  }
  install -o root -g pulsar -m 0640 "$input" "$target"
fi

# Inputs may originate from Windows; systemd EnvironmentFile and bash both
# require Unix line endings for predictable parsing.
sed -i 's/\r$//' "$target"

set_env() {
  local name="$1"
  local value="$2"
  if grep -q "^${name}=" "$target"; then
    sed -i "s#^${name}=.*#${name}=${value}#" "$target"
  else
    printf '%s=%s\n' "$name" "$value" >> "$target"
  fi
}

get_env() {
  local name="$1"
  sed -n "s/^${name}=//p" "$target" | tail -n 1 | tr -d "'\""
}

ensure_text_secret() {
  local name="$1"
  local value
  value="$(get_env "$name")"
  if [[ ${#value} -lt 32 || "$value" == replace-with-* ]]; then
    set_env "$name" "$(openssl rand -hex 32)"
  fi
}

ensure_hex_secret() {
  local name="$1"
  local value
  value="$(get_env "$name")"
  if [[ ! "$value" =~ ^[a-fA-F0-9]{64}$ ]]; then
    set_env "$name" "$(openssl rand -hex 32)"
  fi
}

set_env APP_ENV production
set_env APP_URL https://pulsar-cloud.space
set_env DATABASE_URL file:/var/lib/pulsar/pulsar.db
set_env RESEND_FROM_EMAIL "'Pulsar <auth@pulsar-cloud.space>'"
set_env TELEGRAM_WEBHOOK_URL https://pulsar-cloud.space/api/integrations/telegram/webhook
set_env PAYMENT_PROVIDER platega
set_env BILLING_ENABLED false
set_env PLATEGA_CALLBACK_URL https://pulsar-cloud.space/api/integrations/payments/platega/callback
set_env PLATEGA_RETURN_URL https://pulsar-cloud.space/subscription
set_env PLATEGA_FAILED_URL https://pulsar-cloud.space/subscription
set_env REMNAWAVE_PROVIDER http
set_env REMNAWAVE_BASE_URL https://panel.pulsar-cloud.space
set_env REMNAWAVE_TIMEOUT_MS 8000
set_env PULSAR_TEST_MODE false
set_env PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION false
set_env WORKER_POLL_INTERVAL_MS 1500
set_env WORKER_LEASE_MS 60000
set_env WORKER_BATCH_SIZE 10

ensure_text_secret SESSION_SECRET
ensure_text_secret AUTH_PEPPER
ensure_hex_secret DATA_ENCRYPTION_KEY
ensure_text_secret PAYMENT_WEBHOOK_SECRET

chown root:pulsar "$target"
chmod 0640 "$target"

# Validate presence without printing any credential values.
required=(
  RESEND_API_KEY RESEND_FROM_EMAIL TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME
  TELEGRAM_WEBHOOK_SECRET PLATEGA_MERCHANT_ID
  REMNAWAVE_API_TOKEN
)
for name in "${required[@]}"; do
  [[ -n "$(get_env "$name")" ]] || {
    echo "Missing required production variable: $name" >&2
    exit 1
  }
done

if [[ -z "$(get_env PLATEGA_SECRET)" && -z "$(get_env PLATEGA_API_KEY)" ]]; then
  echo "Missing required production variable: PLATEGA_SECRET or PLATEGA_API_KEY" >&2
  exit 1
fi

echo "Production environment prepared at $target"
