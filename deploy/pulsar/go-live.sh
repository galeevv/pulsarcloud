#!/usr/bin/env bash
# Flip Pulsar from test mode to real-money production, safely and repeatably.
#
# Encodes the two lessons from the first go-live:
#   1) The test-mode-only flag PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE must be
#      cleared — leaving it set used to crash startup in production.
#   2) db:bootstrap-admin must run AFTER the flags flip: it stamps the admin
#      with isTest=<current testMode>, so running it in production promotes the
#      admin to isTest=false. Test-mode users (isTest=true) cannot authenticate
#      in production (the isTest guard is an intentional test/prod firewall).
#
# The env is backed up first and auto-rolled-back if pulsar-web fails to boot.
#
# Usage:  sudo RELEASE=/opt/pulsar/current bash deploy/pulsar/go-live.sh
set -uo pipefail

ENV=/etc/pulsar/pulsar.env
RELEASE="${RELEASE:-/opt/pulsar/current}"
HEALTH_URL="${HEALTH_URL:-https://pulsar-cloud.space/api/health/ready}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BK="/opt/pulsar/backups/pulsar.env.pregolive-$TS"

[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }
[[ -f "$ENV" ]] || { echo "missing $ENV"; exit 1; }

set_env() {
  if grep -q "^${1}=" "$ENV"; then sed -i "s#^${1}=.*#${1}=${2}#" "$ENV"
  else printf '%s=%s\n' "$1" "$2" >> "$ENV"; fi
}

echo "== backup env -> $BK =="
install -d -m 0755 /opt/pulsar/backups
cp -a "$ENV" "$BK"

echo "== flip to production flags =="
set_env PULSAR_TEST_MODE false
set_env PAYMENT_PROVIDER platega
set_env BILLING_ENABLED true
set_env PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION false
# The test-mode-only flag is meaningless in production; clear it so it can never
# contradict PULSAR_TEST_MODE=false.
set_env PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE false
grep -E '^(PULSAR_TEST_MODE|PAYMENT_PROVIDER|BILLING_ENABLED|PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION|PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE)=' "$ENV" | sed 's/^/  /'

echo "== stop services (frees the DB for admin promotion) =="
systemctl stop pulsar-web pulsar-worker

echo "== promote admin to production + ensure pricing (runs in prod mode now) =="
sudo -u pulsar env RELEASE="$RELEASE" bash -lc '
  set -euo pipefail; set -a; . /etc/pulsar/pulsar.env; set +a
  cd "$RELEASE"; npm run db:bootstrap-admin; npm run db:seed:pricing
'

echo "== start web =="
systemctl start pulsar-web
sleep 6
if systemctl is-active --quiet pulsar-web && \
   curl -fsS -m 12 "$HEALTH_URL" 2>/dev/null | grep -q '"billingEnabled":true'; then
  systemctl start pulsar-worker
  echo "== GO-LIVE OK == web=$(systemctl is-active pulsar-web) worker=$(systemctl is-active pulsar-worker)"
  curl -fsS -m 12 "$HEALTH_URL" 2>/dev/null; echo
else
  echo "!! pulsar-web unhealthy — ROLLING BACK env"
  cp -a "$BK" "$ENV"
  systemctl restart pulsar-web pulsar-worker
  echo "  rolled back. last journal:"; journalctl -u pulsar-web -n 20 --no-pager | tail -20
  exit 3
fi
