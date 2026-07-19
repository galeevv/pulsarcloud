#!/usr/bin/env bash
# Back up the Remnawave panel: PostgreSQL dump + panel configs.
# Runs on the panel server (pulsar2 / 31.76.27.41). Idempotent, rotates old
# backups. No secrets are printed.
#
# Optional env:
#   REMNAWAVE_DIR   panel compose dir (default /opt/remnawave)
#   BACKUP_DIR      output dir (default /opt/pulsar/backups/remnawave)
#   KEEP_DAYS       retention in days (default 14)
#   DB_CONTAINER    postgres container name (default remnawave-db)
set -Eeuo pipefail
cd "$(dirname "$0")"
. ./lib.sh

require_root
need_cmd docker

REMNAWAVE_DIR="${REMNAWAVE_DIR:-/opt/remnawave}"
BACKUP_DIR="${BACKUP_DIR:-/opt/pulsar/backups/remnawave}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-remnawave-db}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

install -d -m 0750 "$BACKUP_DIR"
docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" || die "DB container not running: $DB_CONTAINER"

# Read DB creds from the container's own environment (never echoed).
PGUSER="$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER 2>/dev/null || echo postgres)"
PGDB="$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB 2>/dev/null || echo postgres)"

dump="$BACKUP_DIR/remnawave-db-${stamp}.sql.gz"
log "Dumping database '${PGDB}' as '${PGUSER}'..."
docker exec "$DB_CONTAINER" pg_dump -U "$PGUSER" -d "$PGDB" | gzip -9 > "$dump"
[ -s "$dump" ] || die "Dump is empty — backup failed."
chmod 0640 "$dump"
ok "Database dumped: $dump ($(du -h "$dump" | cut -f1))"

# Panel configuration (compose + env) — env has 0600 perms preserved by tar.
if [ -d "$REMNAWAVE_DIR" ]; then
  cfg="$BACKUP_DIR/remnawave-config-${stamp}.tar.gz"
  tar -C "$(dirname "$REMNAWAVE_DIR")" -czf "$cfg" "$(basename "$REMNAWAVE_DIR")"
  chmod 0640 "$cfg"
  ok "Config archived: $cfg"
fi

log "Rotating backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -type f -name 'remnawave-*' -mtime "+${KEEP_DAYS}" -print -delete || true

echo
ok "Backup complete. Latest:"
ls -1t "$BACKUP_DIR" | head -4 | sed 's/^/  /'
warn "Copy backups OFF this host — a single copy in the same VPS is not a backup."
