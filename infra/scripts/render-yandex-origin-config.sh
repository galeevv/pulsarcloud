#!/usr/bin/env bash
# Render the nginx origin config for the Yandex CDN LTE node from .env.
# Refuses placeholders, validates domains, backs up the existing config,
# runs `nginx -t`, and only then reloads. Supports --dry-run.
#
# Usage:
#   sudo ./render-yandex-origin-config.sh            # render + nginx -t + reload
#   sudo ./render-yandex-origin-config.sh --dry-run  # render to stdout only
set -Eeuo pipefail
cd "$(dirname "$0")"
. ./lib.sh

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

ENV_FILE="${ENV_FILE:-../yandex-cdn/.env}"
TMPL="${TMPL:-../yandex-cdn/nginx-origin.conf.tmpl}"
OUT="${OUT:-/etc/nginx/sites-available/pulsar-xhttp-origin.conf}"

[ -f "$ENV_FILE" ] || die "Env file not found: $ENV_FILE (copy .env.example -> .env and fill it)."
[ -f "$TMPL" ] || die "Template not found: $TMPL"

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

require_var YANDEX_ORIGIN_DOMAIN
: "${XRAY_XHTTP_PORT:=11443}"

valid_domain() { printf '%s' "$1" | grep -qE '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'; }
valid_domain "$YANDEX_ORIGIN_DOMAIN" || die "YANDEX_ORIGIN_DOMAIN is not a valid domain: $YANDEX_ORIGIN_DOMAIN"

rendered="$(sed \
  -e "s/__ORIGIN_DOMAIN__/${YANDEX_ORIGIN_DOMAIN}/g" \
  -e "s/__XHTTP_PORT__/${XRAY_XHTTP_PORT}/g" \
  "$TMPL")"

if [ "$DRY_RUN" = "1" ]; then
  printf '%s\n' "$rendered"
  ok "Dry-run only — nothing written."
  exit 0
fi

require_root
need_cmd nginx

if [ ! -d "/etc/letsencrypt/live/${YANDEX_ORIGIN_DOMAIN}" ]; then
  warn "No Let's Encrypt cert yet for ${YANDEX_ORIGIN_DOMAIN}."
  warn "Issue it first, e.g.: certbot certonly --nginx -d ${YANDEX_ORIGIN_DOMAIN}"
fi

backup_file "$OUT"
printf '%s\n' "$rendered" > "$OUT"
ln -sf "$OUT" /etc/nginx/sites-enabled/pulsar-xhttp-origin.conf

log "Validating nginx configuration..."
if ! nginx -t; then
  die "nginx -t failed — fix the config; the reload was NOT performed."
fi
systemctl reload nginx
ok "Origin nginx rendered and reloaded for ${YANDEX_ORIGIN_DOMAIN}."
