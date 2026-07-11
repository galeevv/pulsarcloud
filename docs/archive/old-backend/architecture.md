ARCHIVED: документ описывает удаленную реализацию backend и не является актуальной архитектурой Pulsar 2.0.

# Architecture

Pulsar 2.0 runs as one Next.js App Router web process and one background worker.
Both use one persistent SQLite database, `pulsar.db`, through Prisma 7 and
`@prisma/adapter-better-sqlite3`. No network filesystem or additional web/worker
replicas are supported by this topology.

## Boundaries

- `app/*`: pages, route handlers, and thin authenticated Server Actions.
- `lib/db.ts`: the single process-wide Prisma client and mandatory SQLite startup checks.
- `lib/transactions.ts`: short SQL transactions with bounded `SQLITE_BUSY` retry.
- `src/server/services/*`: domain workflows and integration adapters.
- `src/server/worker.ts`: one durable `Job` consumer.
- `prisma/*`: schema, clean SQLite baseline migration, and development seed.

External HTTP calls are never made inside SQL transactions. A transaction
commits domain state and a `Job`; the worker performs I/O and commits the result
in a second short transaction.

## Foundation entities

`User`, `AuthIdentity`, `AuthChallenge`, `Session`, `PricingVersion`,
`PriceQuote`, `Payment`, `PaymentWebhookEvent`, `Subscription`,
`SubscriptionPeriod`, `ReferralProfile`, `ReferralInvite`, `ReferralReward`,
`WalletLedgerEntry`, `PayoutRequest`, `SupportConversation`, `SupportMessage`,
`TelegramUpdate`, `Job`, and `AuditEvent`.

`Node` is retained as the VPN provisioning inventory used by the existing admin
UX. Legal documents remain version-controlled markdown files.

## SQLite safety

Every web/worker connection verifies a SQLite build containing the WAL-reset
fix, then checks `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=FULL`,
`busy_timeout=5000`, and `temp_store=MEMORY`.
