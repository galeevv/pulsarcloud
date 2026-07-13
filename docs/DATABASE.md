# Database

Prisma 7.8 uses SQLite through `@prisma/adapter-better-sqlite3`. Money is stored only as integer minor units. The initial migration is `prisma/migrations/20260713003000_init/migration.sql`; `20260713015000_billing_reconciliation_guards` adds the staged-plan boundary and the partial unique index that permits only one open checkout per user. Together they enforce identity, token, payment/event, one-subscription, referral, wallet-ledger, Telegram-update, and outbox idempotency constraints.

Each runtime process calls `initializeDatabase()` and applies `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`, and `wal_autocheckpoint=1000`. Transactions are short; `withBusyRetry` provides bounded retry for explicitly retriable operations. Worker concurrency is one.

Production uses `DATABASE_URL=file:/var/lib/pulsar/pulsar.db`. The file must stay on local NVMe, never NFS/SMB/OneDrive. Check runtime SQLite with `GET /api/health/ready` or `sqlite3 /var/lib/pulsar/pulsar.db 'select sqlite_version();'`. Run `PRAGMA wal_checkpoint(PASSIVE);` during normal operations; use `TRUNCATE` only in a maintenance window after both processes stop.

Before every production migration, execute `/usr/bin/bash scripts/backup-sqlite.sh`, verify its `quick_check`, then run `npm run db:deploy`.
