# Operations

Run web and worker as separate systemd units. `GET /api/health/live` proves the web process is alive. `GET /api/health/ready` checks SQLite, applied migrations, and freshness of `worker_heartbeat`; it deliberately does not call external providers. Provider failures must therefore also be monitored through `IntegrationLog`, failed/dead outbox jobs, and the provider dashboards.

## Routine checks

```bash
systemctl status pulsar-web pulsar-worker pulsar-backup.timer
systemctl list-timers pulsar-backup.timer
journalctl -u pulsar-web -u pulsar-worker --since today
curl -fsS https://pulsar-cloud.space/api/health/live
curl -fsS https://pulsar-cloud.space/api/health/ready
sqlite3 /var/lib/pulsar/pulsar.db 'PRAGMA quick_check; PRAGMA wal_checkpoint(PASSIVE);'
df -h /var/lib/pulsar /var/backups/pulsar
free -h
```

Alert on readiness failure, a stale worker heartbeat, `DEAD` jobs, repeated integration errors, `syncStatus=FAILED`, pending/manual-review payouts or refunds, failed backup units, and a missing verified backup within the expected six-hour window. The worker retries with exponential backoff/jitter and recovers expired leases; retry an exhausted job only after correcting its cause.

After every release or infrastructure change, run the non-mutating production acceptance audit:

```bash
sudo bash /opt/pulsar/current/deploy/pulsar/audit-production.sh
```

It reports only named pass/fail checks and never prints secret values. A failure in environment invariants, database integrity/permissions, service state, listener/UFW policy, TLS, readiness, framing headers, or the billing-off safety lock blocks handoff.

The worker also creates minute-bucketed subscription reconciliation and six-hour cleanup jobs. Cleanup retains payment webhook logs for 180 days, integration logs for 90 days, and processed Telegram updates, completed outbox jobs, and completed auth challenges for 30 days. `AuditLog`, payments, immutable subscription events, wallet ledger entries, and payout records are not removed by this maintenance job.

## Backups and restore drills

Run and verify an on-demand backup before every migration:

```bash
sudo -u pulsar /usr/bin/bash /opt/pulsar/current/scripts/backup-sqlite.sh
latest=$(find /var/backups/pulsar -maxdepth 1 -type f -name 'pulsar-*.db.gz' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)
gzip -t "$latest"
(cd "$(dirname "$latest")" && sha256sum -c "$(basename "$latest").sha256")
```

Copy backups to a second host/object store; a disk-local copy is not disaster recovery. Test a restore periodically on a disposable host. A real restore requires both `pulsar-web` and `pulsar-worker` stopped and follows [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md). Never replace the database by copying only the main WAL-mode file while processes are running.

## Releases and rollback

Use immutable `/opt/pulsar/releases/<timestamp>` directories and atomically replace `/opt/pulsar/current`; never build in `current`. The production env lives only at `/etc/pulsar/pulsar.env`: load it after `npm ci`, immediately before dependency generation/build, so dependency lifecycle scripts cannot read production secrets. Build on Linux with `npm ci --include=dev` because the worker needs `tsx` at runtime and `better-sqlite3` is platform-native. Follow the exact release, migration, symlink, service-restart, health-check, and rollback procedure in [DEPLOY_VPS.md](DEPLOY_VPS.md).

Keep at least the current and previous known-good release. A code rollback does not reverse a schema migration. Migrations must be forward-compatible with the previous release; otherwise schedule maintenance and stop both services. Restore a pre-migration database only after explicitly accepting the loss of all writes made since that snapshot.

## Capacity and network ownership

Host Nginx is the only process that owns public ports 80/443. Pulsar remains on `127.0.0.1:3000`; SQLite and Remnawave internal ports are never opened in UFW. Before installing or updating Remnawave, use `ss -ltnp` and inspect Docker port publishing: Remnawave Panel defaults to port 3000 and would conflict with Pulsar unless its **host-side** binding is changed to a confirmed free loopback port.

The preferred topology is a separate Remnawave Panel VPS and separate traffic Nodes. The current 2 vCPU/4 GB management host is an explicit, monitored capacity exception: it may co-locate only the single-instance Panel stack with 2 GB swap, bounded Pulsar services, and no Remnawave Node or VPN traffic. Build during a controlled window and move the Panel or add RAM if swap churn or sustained memory pressure appears. See [DEPLOY_VPS.md](DEPLOY_VPS.md) and [REMNAWAVE.md](REMNAWAVE.md).
