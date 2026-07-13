#!/usr/bin/env bash
set -euo pipefail
umask 077

set -a
source /etc/pulsar/pulsar.env
set +a

panel_url="${REMNAWAVE_BASE_URL:?REMNAWAVE_BASE_URL is required}"
pulsar_env="/etc/pulsar/pulsar.env"
authorization="Authorization: Bearer ${REMNAWAVE_API_TOKEN:?REMNAWAVE_API_TOKEN is required}"

standard_profile_name="PULSAR_TEST_STANDARD_PROFILE"
lte_profile_name="PULSAR_TEST_LTE_PROFILE"
standard_inbound_tag="PULSAR_TEST_STANDARD"
lte_inbound_tag="PULSAR_TEST_LTE"
standard_squad_name="PULSAR_TEST_STANDARD"
lte_squad_name="PULSAR_TEST_LTE"

profile_payload() {
  local name="$1"
  local inbound_tag="$2"
  local port="$3"
  jq -nc \
    --arg name "$name" \
    --arg inboundTag "$inbound_tag" \
    --argjson port "$port" \
    '{
      name: $name,
      config: {
        log: {loglevel: "warning"},
        inbounds: [{
          tag: $inboundTag,
          listen: "127.0.0.1",
          port: $port,
          protocol: "shadowsocks",
          settings: {
            clients: [],
            method: "chacha20-ietf-poly1305",
            network: "tcp,udp"
          },
          sniffing: {enabled: false}
        }],
        outbounds: [{protocol: "blackhole", tag: "BLOCK"}],
        routing: {
          rules: [{
            type: "field",
            inboundTag: [$inboundTag],
            outboundTag: "BLOCK"
          }]
        }
      }
    }'
}

ensure_profile() {
  local name="$1"
  local inbound_tag="$2"
  local port="$3"
  local profiles profile inbound_uuid
  profiles="$(curl -fsS -H "$authorization" "$panel_url/api/config-profiles")"
  profile="$(jq -c --arg name "$name" \
    '.response.configProfiles[] | select(.name == $name)' <<<"$profiles")"
  if [[ -z "$profile" ]]; then
    profile="$(curl -fsS \
      -H 'Content-Type: application/json' \
      -H "$authorization" \
      --data "$(profile_payload "$name" "$inbound_tag" "$port")" \
      "$panel_url/api/config-profiles")"
    profile="$(jq -c '.response' <<<"$profile")"
  fi
  jq -e '.nodes | length == 0' <<<"$profile" >/dev/null || {
    echo "Refusing to reuse TEST profile attached to a Node: $name" >&2
    return 1
  }
  inbound_uuid="$(jq -er --arg tag "$inbound_tag" \
    '.inbounds[] | select(.tag == $tag) | .uuid' <<<"$profile")"
  jq -nc \
    --arg profileUuid "$(jq -er '.uuid' <<<"$profile")" \
    --arg inboundUuid "$inbound_uuid" \
    '{profileUuid: $profileUuid, inboundUuid: $inboundUuid}'
}

ensure_squad() {
  local name="$1"
  local inbound_uuid="$2"
  local squads squad
  squads="$(curl -fsS -H "$authorization" "$panel_url/api/internal-squads")"
  squad="$(jq -c --arg name "$name" \
    '.response.internalSquads[] | select(.name == $name)' <<<"$squads")"
  if [[ -z "$squad" ]]; then
    squad="$(curl -fsS \
      -H 'Content-Type: application/json' \
      -H "$authorization" \
      --data "$(jq -nc --arg name "$name" --arg inbound "$inbound_uuid" \
        '{name: $name, inbounds: [$inbound]}')" \
      "$panel_url/api/internal-squads")"
    squad="$(jq -c '.response' <<<"$squad")"
  fi
  jq -e --arg inbound "$inbound_uuid" \
    'any(.inbounds[]; .uuid == $inbound)' <<<"$squad" >/dev/null
  jq -er '.uuid' <<<"$squad"
}

upsert_env() {
  local key="$1"
  local value="$2"
  local env_tmp
  env_tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    index($0, key "=") == 1 {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (!replaced) print key "=" value
    }
  ' "$pulsar_env" >"$env_tmp"
  install -o root -g pulsar -m 0640 "$env_tmp" "$pulsar_env"
  rm -f "$env_tmp"
}

standard_profile="$(ensure_profile "$standard_profile_name" "$standard_inbound_tag" 65530)"
lte_profile="$(ensure_profile "$lte_profile_name" "$lte_inbound_tag" 65531)"

standard_squad_uuid="$(ensure_squad "$standard_squad_name" \
  "$(jq -er '.inboundUuid' <<<"$standard_profile")")"
lte_squad_uuid="$(ensure_squad "$lte_squad_name" \
  "$(jq -er '.inboundUuid' <<<"$lte_profile")")"

upsert_env REMNAWAVE_STANDARD_SQUAD_UUID "$standard_squad_uuid"
upsert_env REMNAWAVE_LTE_SQUAD_UUID "$lte_squad_uuid"

jq -nc \
  --arg standardProfileUuid "$(jq -er '.profileUuid' <<<"$standard_profile")" \
  --arg standardInboundUuid "$(jq -er '.inboundUuid' <<<"$standard_profile")" \
  --arg standardSquadUuid "$standard_squad_uuid" \
  --arg lteProfileUuid "$(jq -er '.profileUuid' <<<"$lte_profile")" \
  --arg lteInboundUuid "$(jq -er '.inboundUuid' <<<"$lte_profile")" \
  --arg lteSquadUuid "$lte_squad_uuid" \
  '{
    standard: {
      profileUuid: $standardProfileUuid,
      inboundUuid: $standardInboundUuid,
      squadUuid: $standardSquadUuid
    },
    lte: {
      profileUuid: $lteProfileUuid,
      inboundUuid: $lteInboundUuid,
      squadUuid: $lteSquadUuid
    }
  }'
