#!/usr/bin/env bash
# Read-only health checks for a Remnawave traffic/origin node. No secrets printed.
#
# Optional env:
#   ROLE            reality | hysteria | lte-origin (tailors port checks)
#   APP_PORT        node admin/data port (default 2222)
#   ORIGIN_DOMAIN   for lte-origin: domain to check the local cert + /health
set -Eeuo pipefail
cd "$(dirname "$0")"
. ./lib.sh

APP_PORT="${APP_PORT:-2222}"
ROLE="${ROLE:-}"
fail=0
check() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else warn "$1 — FAILED"; fail=1; fi; }

log "Node validation (role=${ROLE:-unset})"
check "docker daemon reachable"            "docker info"
check "remnanode container running"        "docker ps --format '{{.Names}}' | grep -qx remnanode"
check "xray process present in container"  "docker exec remnanode pgrep -x xray"
check "node admin port ${APP_PORT} listening" "ss -H -ltn sport = :${APP_PORT} | grep -q LISTEN"
check "outbound internet (1.1.1.1:443)"    "timeout 5 bash -c '</dev/tcp/1.1.1.1/443'"

case "$ROLE" in
  reality)
    check "public 443/tcp listening" "ss -H -ltn 'sport = :443' | grep -q LISTEN"
    ;;
  hysteria)
    check "public 443/udp listening" "ss -H -lun 'sport = :443' | grep -q LISTEN"
    ;;
  lte-origin)
    check "loopback xHTTP 11443 listening" "ss -H -ltn 'sport = :11443' | grep -q LISTEN"
    check "nginx active" "systemctl is-active --quiet nginx"
    if [ -n "${ORIGIN_DOMAIN:-}" ]; then
      check "origin cert present for ${ORIGIN_DOMAIN}" "test -f /etc/letsencrypt/live/${ORIGIN_DOMAIN}/fullchain.pem"
      check "origin /health responds" "curl -skf https://127.0.0.1/health --resolve ${ORIGIN_DOMAIN}:443:127.0.0.1 -H 'Host: ${ORIGIN_DOMAIN}'"
    fi
    ;;
esac

echo
[ "$fail" -eq 0 ] && ok "All checks passed." || die "One or more checks failed."
