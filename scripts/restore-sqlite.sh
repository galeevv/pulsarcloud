#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# -eq 1 ]] || { echo "Usage: $0 BACKUP.db[.gz]" >&2; exit 2; }
DB_PATH="${PULSAR_DB_PATH:-/var/lib/pulsar/pulsar.db}"
BACKUP_DIR="${PULSAR_BACKUP_DIR:-/var/backups/pulsar}"
source="$1"
[[ -f "$source" && -s "$source" ]] || { echo "Backup is missing or empty" >&2; exit 1; }
if [[ -f "$source.sha256" ]]; then (cd "$(dirname "$source")" && sha256sum -c "$(basename "$source").sha256"); fi
if systemctl is-active --quiet pulsar-web || systemctl is-active --quiet pulsar-worker; then echo "Stop pulsar-web and pulsar-worker before restore" >&2; exit 1; fi
mkdir -p "$BACKUP_DIR" "$(dirname "$DB_PATH")"
exec 9>"$BACKUP_DIR/.restore.lock"
flock -n 9 || { echo "Another restore is running" >&2; exit 1; }
candidate="$(mktemp --tmpdir="$(dirname "$DB_PATH")" .restore-candidate.XXXXXX.db)"
trap 'rm -f "$candidate"' EXIT
if [[ "$source" == *.gz ]]; then gzip -cd "$source" > "$candidate"; else cp -- "$source" "$candidate"; fi
[[ "$(sqlite3 "$candidate" 'PRAGMA integrity_check;')" = "ok" ]] || { echo "Candidate integrity_check failed" >&2; exit 1; }
[[ -z "$(sqlite3 "$candidate" 'PRAGMA foreign_key_check;')" ]] || { echo "Candidate foreign_key_check failed" >&2; exit 1; }
if [[ -f "$DB_PATH" && -s "$DB_PATH" ]]; then
  safety="$BACKUP_DIR/pulsar-before-restore-$(date -u +%Y%m%dT%H%M%SZ).db"
  sqlite3 "$DB_PATH" ".timeout 5000" ".backup '$safety'"
  [[ "$(sqlite3 "$safety" 'PRAGMA quick_check;')" = "ok" ]] || { echo "Pre-restore safety backup failed" >&2; exit 1; }
fi
rm -f -- "$DB_PATH-wal" "$DB_PATH-shm"
install -o pulsar -g pulsar -m 0600 "$candidate" "$DB_PATH.new"
mv -f "$DB_PATH.new" "$DB_PATH"
[[ "$(sqlite3 "$DB_PATH" 'PRAGMA integrity_check;')" = "ok" ]] || { echo "Post-restore integrity_check failed; use safety backup" >&2; exit 1; }
echo "Restore complete. Apply migrations for the matching release, then start services: $DB_PATH"
