#!/usr/bin/env bash
set -euo pipefail

set -a
source /etc/pulsar/pulsar.env
set +a

panel_url=https://panel.pulsar-cloud.space
username="pulsar-smoke-$(date -u +%Y%m%d%H%M%S)"
expire_at="$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%S.000Z)"
payload="$(jq -nc \
  --arg username "$username" \
  --arg expireAt "$expire_at" \
  '{username: $username, expireAt: $expireAt, status: "ACTIVE"}')"
created="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${REMNAWAVE_API_TOKEN}" \
  --data "$payload" \
  "$panel_url/api/users/")"
uuid="$(jq -er '.response.uuid' <<<"$created")"
short_uuid="$(jq -er '.response.shortUuid' <<<"$created")"
unset created payload

cleanup() {
  curl -fsS \
    --request DELETE \
    -H "Authorization: Bearer ${REMNAWAVE_API_TOKEN}" \
    "$panel_url/api/users/${uuid}" >/dev/null || true
}
trap cleanup EXIT

body="$(mktemp)"
status="$(curl -sS -o "$body" -w '%{http_code}' \
  "https://sub.pulsar-cloud.space/${short_uuid}")"
bytes="$(wc -c < "$body")"
rm -f "$body"

[[ "$status" == 200 && "$bytes" -gt 100 ]] || {
  echo "Subscription page smoke test failed: HTTP $status, $bytes bytes" >&2
  exit 1
}
echo "Subscription page smoke test passed: HTTP $status, $bytes bytes"

