#!/usr/bin/env bash
set -euo pipefail
umask 077
DB_PATH="${PULSAR_DB_PATH:-/var/lib/pulsar/pulsar.db}"
BACKUP_DIR="${PULSAR_BACKUP_DIR:-/var/backups/pulsar}"
RETENTION_DAYS="${PULSAR_BACKUP_RETENTION_DAYS:-35}"
COMPRESS="${PULSAR_BACKUP_COMPRESS:-true}"
[[ -f "$DB_PATH" && -s "$DB_PATH" ]] || { echo "Source database is missing or empty: $DB_PATH" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || { echo "Another backup is running" >&2; exit 1; }
[[ "$(sqlite3 "$DB_PATH" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('User','_prisma_migrations');")" = "2" ]] || { echo "Schema sentinel check failed" >&2; exit 1; }
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="$BACKUP_DIR/.pulsar-$timestamp.tmp.db"
base="$BACKUP_DIR/pulsar-$timestamp.db"
trap 'rm -f "$tmp" "$tmp.gz"' EXIT
sqlite3 "$DB_PATH" ".timeout 5000" ".backup '$tmp'"
[[ -s "$tmp" && "$(sqlite3 "$tmp" 'PRAGMA quick_check;')" = "ok" ]] || { echo "Backup verification failed" >&2; exit 1; }
if [[ "$COMPRESS" == "true" ]]; then
  gzip -9 -c "$tmp" > "$tmp.gz"
  gzip -t "$tmp.gz"
  mv "$tmp.gz" "$base.gz"
  target="$base.gz"
else
  mv "$tmp" "$base"
  target="$base"
fi
sha256sum "$target" > "$target.sha256"
find "$BACKUP_DIR" -type f \( -name 'pulsar-*.db' -o -name 'pulsar-*.db.gz' -o -name 'pulsar-*.sha256' \) -mtime "+$RETENTION_DAYS" -delete
echo "$target"
