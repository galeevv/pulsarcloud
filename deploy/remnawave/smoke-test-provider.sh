#!/usr/bin/env bash
set -euo pipefail
umask 077

set -a
source /etc/pulsar/pulsar.env
set +a

panel_url="${REMNAWAVE_BASE_URL:?REMNAWAVE_BASE_URL is required}"
authorization="Authorization: Bearer ${REMNAWAVE_API_TOKEN:?REMNAWAVE_API_TOKEN is required}"
standard_squad="${REMNAWAVE_STANDARD_SQUAD_UUID:?REMNAWAVE_STANDARD_SQUAD_UUID is required}"
lte_squad="${REMNAWAVE_LTE_SQUAD_UUID:?REMNAWAVE_LTE_SQUAD_UUID is required}"
username="pulsar_smoke_$(date -u +%Y%m%d%H%M%S)"
remote_uuid=""

cleanup() {
  if [[ -n "$remote_uuid" ]]; then
    curl -fsS --request DELETE -H "$authorization" \
      "$panel_url/api/users/$remote_uuid" >/dev/null || true
  fi
}
trap cleanup EXIT

create_expiry="$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%S.000Z)"
create_payload="$(jq -nc \
  --arg username "$username" \
  --arg expireAt "$create_expiry" \
  --arg standardSquad "$standard_squad" \
  '{
    username: $username,
    expireAt: $expireAt,
    status: "ACTIVE",
    trafficLimitBytes: 0,
    trafficLimitStrategy: "NO_RESET",
    hwidDeviceLimit: 1,
    activeInternalSquads: [$standardSquad],
    description: "Temporary Pulsar provider smoke test"
  }')"
created="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -H "$authorization" \
  --data "$create_payload" \
  "$panel_url/api/users")"
remote_uuid="$(jq -er '.response.uuid' <<<"$created")"
original_url="$(jq -er '.response.subscriptionUrl' <<<"$created")"
jq -e \
  --arg standardSquad "$standard_squad" \
  --arg lteSquad "$lte_squad" '
    .response.hwidDeviceLimit == 1 and
    any(.response.activeInternalSquads[]; .uuid == $standardSquad) and
    (any(.response.activeInternalSquads[]; .uuid == $lteSquad) | not)
  ' <<<"$created" >/dev/null
unset created create_payload

update_expiry="$(date -u -d '+2 days' +%Y-%m-%dT%H:%M:%S.000Z)"
update_payload="$(jq -nc \
  --arg uuid "$remote_uuid" \
  --arg expireAt "$update_expiry" \
  --arg standardSquad "$standard_squad" \
  --arg lteSquad "$lte_squad" \
  '{
    uuid: $uuid,
    expireAt: $expireAt,
    status: "ACTIVE",
    trafficLimitBytes: 0,
    trafficLimitStrategy: "NO_RESET",
    hwidDeviceLimit: 2,
    activeInternalSquads: [$standardSquad, $lteSquad]
  }')"
updated="$(curl -fsS \
  --request PATCH \
  -H 'Content-Type: application/json' \
  -H "$authorization" \
  --data "$update_payload" \
  "$panel_url/api/users")"
jq -e \
  --arg uuid "$remote_uuid" \
  --arg expireAt "$update_expiry" \
  --arg standardSquad "$standard_squad" \
  --arg lteSquad "$lte_squad" '
    .response.uuid == $uuid and
    .response.expireAt == $expireAt and
    .response.hwidDeviceLimit == 2 and
    any(.response.activeInternalSquads[]; .uuid == $standardSquad) and
    any(.response.activeInternalSquads[]; .uuid == $lteSquad)
  ' <<<"$updated" >/dev/null
unset updated update_payload

by_username="$(curl -fsS -H "$authorization" \
  "$panel_url/api/users/by-username/$username")"
jq -e --arg uuid "$remote_uuid" '.response.uuid == $uuid' \
  <<<"$by_username" >/dev/null
unset by_username

rotated="$(curl -fsS \
  --request POST \
  -H 'Content-Type: application/json' \
  -H "$authorization" \
  --data '{}' \
  "$panel_url/api/users/$remote_uuid/actions/revoke")"
rotated_url="$(jq -er '.response.subscriptionUrl' <<<"$rotated")"
[[ "$rotated_url" != "$original_url" ]]
unset rotated original_url

subscription_body="$(mktemp)"
subscription_status="$(curl -sS -o "$subscription_body" -w '%{http_code}' \
  "$rotated_url")"
subscription_bytes="$(wc -c <"$subscription_body")"
rm -f "$subscription_body"
[[ "$subscription_status" == 200 && "$subscription_bytes" -gt 100 ]]
unset rotated_url

deleted_uuid="$remote_uuid"
curl -fsS --request DELETE -H "$authorization" \
  "$panel_url/api/users/$remote_uuid" >/dev/null
remote_uuid=""
deleted_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "$authorization" "$panel_url/api/users/$deleted_uuid")"
[[ "$deleted_status" == 404 ]]

echo "Remnawave provider smoke test passed and temporary user was deleted"
echo "Temporary user UUID: $deleted_uuid"
echo "Subscription page: HTTP $subscription_status, $subscription_bytes bytes"
