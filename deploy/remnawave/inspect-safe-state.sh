#!/usr/bin/env bash
set -euo pipefail

set -a
source /etc/pulsar/pulsar.env
set +a

panel_url="${REMNAWAVE_BASE_URL:?REMNAWAVE_BASE_URL is required}"
authorization="Authorization: Bearer ${REMNAWAVE_API_TOKEN:?REMNAWAVE_API_TOKEN is required}"

echo "Config profiles (safe fields only)"
curl -fsS -H "$authorization" "$panel_url/api/config-profiles" |
  jq -c '[.response.configProfiles[] | {
    uuid,
    name,
    nodes: [.nodes[] | {uuid, name}],
    inbounds: [.inbounds[] | {uuid, tag, port, protocol}],
    testConfig: (if (.name | startswith("PULSAR_TEST_")) then {
      inbounds: [.config.inbounds[] | {tag, listen, port, protocol}],
      outbounds: [.config.outbounds[] | {tag, protocol}],
      routing: .config.routing
    } else null end)
  }]'

echo "Internal squads (safe fields only)"
curl -fsS -H "$authorization" "$panel_url/api/internal-squads" |
  jq -c '[.response.internalSquads[] | {
    uuid,
    name,
    inbounds: [.inbounds[] | {uuid, tag}]
  }]'

echo "Nodes (safe fields only)"
curl -fsS -H "$authorization" "$panel_url/api/nodes" |
  jq -c '
    if (.response | type) == "array" then
      [.response[] | {uuid, name, isConnected, isDisabled}]
    else
      [.response.nodes[] | {uuid, name, isConnected, isDisabled}]
    end
  '
