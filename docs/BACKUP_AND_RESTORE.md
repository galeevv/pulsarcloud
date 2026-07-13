# Backup and restore

`scripts/backup-sqlite.sh` uses SQLite `.backup`, verifies `PRAGMA quick_check`, applies restrictive permissions, optionally gzip-compresses, and removes files older than the configured retention. The systemd timer runs every six hours. Keep seven daily and four weekly/off-site copies; the local 35-day window supports both.

Copy completed files to encrypted object storage or a second host using a separate least-privilege job. Do not sync the open live DB as the only backup.

Restore rehearsal:

```bash
sudo systemctl stop pulsar-web pulsar-worker
sudo -u pulsar PULSAR_DB_PATH=/var/lib/pulsar/rehearsal.db /usr/bin/bash /opt/pulsar/current/scripts/restore-sqlite.sh /var/backups/pulsar/pulsar-TIMESTAMP.db.gz
sqlite3 /var/lib/pulsar/rehearsal.db 'pragma integrity_check;'
```

For a real restore, stop both processes, run the same script with the production path, then start worker and web and check readiness. The script verifies the candidate and saves the current DB before replacement; a failed verification never deletes the working DB. Always take a fresh backup before migration.
