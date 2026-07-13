#!/usr/bin/env bash
set -euo pipefail
umask 077

panel_url="https://panel.pulsar-cloud.space"
credentials_file="/root/remnawave-initial-admin.txt"
pulsar_env="/etc/pulsar/pulsar.env"

if [[ ! -r "$credentials_file" || ! -r "$pulsar_env" ]]; then
  echo "Required Remnawave credentials or Pulsar environment file is missing" >&2
  exit 1
fi

username="$(sed -n 's/^USERNAME=//p' "$credentials_file")"
password="$(sed -n 's/^PASSWORD=//p' "$credentials_file")"
login_payload="$(jq -nc --arg username "$username" --arg password "$password" \
  '{username: $username, password: $password}')"
echo "Authenticating to Remnawave"
login_response="$(curl -fsS \
  -H 'Content-Type: application/json' \
  --data "$login_payload" \
  "$panel_url/api/auth/login")"
access_token="$(jq -er '.response.accessToken' <<<"$login_response")"
unset password login_payload login_response

echo "Reading existing API tokens"
tokens_response="$(curl -fsS \
  -H 'X-Remnawave-Client-Type: browser' \
  -H "Authorization: Bearer ${access_token}" \
  "$panel_url/api/tokens/")"
mapfile -t old_token_uuids < <(
  jq -r '.response.tokens[] | select(.name | startswith("pulsar-backend")) | .uuid' \
    <<<"$tokens_response"
)
unset tokens_response

token_name="pulsar-backend-$(date -u +%Y%m%d%H%M%S)"
create_payload="$(jq -nc --arg name "$token_name" \
  '{name: $name, expiresInDays: 365, scopes: ["*"]}')"
echo "Creating replacement API token"
create_response="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -H 'X-Remnawave-Client-Type: browser' \
  -H "Authorization: Bearer ${access_token}" \
  --data "$create_payload" \
  "$panel_url/api/tokens/")"
new_token="$(jq -er '.response.token' <<<"$create_response")"
new_token_uuid="$(jq -er '.response.uuid' <<<"$create_response")"
unset create_payload create_response

env_tmp="$(mktemp)"
awk -v token="$new_token" '
  BEGIN { replaced = 0 }
  /^REMNAWAVE_API_TOKEN=/ {
    print "REMNAWAVE_API_TOKEN=" token
    replaced = 1
    next
  }
  { print }
  END {
    if (!replaced) print "REMNAWAVE_API_TOKEN=" token
  }
' "$pulsar_env" >"$env_tmp"
install -o root -g pulsar -m 0640 "$env_tmp" "$pulsar_env"
rm -f "$env_tmp"

curl -fsS \
  -H "Authorization: Bearer ${new_token}" \
  "$panel_url/api/users?size=1" >/dev/null
unset new_token

echo "Removing superseded Pulsar API tokens"
for uuid in "${old_token_uuids[@]}"; do
  [[ "$uuid" == "$new_token_uuid" ]] && continue
  curl -fsS \
    --request DELETE \
    -H 'X-Remnawave-Client-Type: browser' \
    -H "Authorization: Bearer ${access_token}" \
    "$panel_url/api/tokens/${uuid}" >/dev/null
done
unset access_token

echo "Pulsar Remnawave API token rotated successfully (${new_token_uuid})"
