# Architecture

Pulsar is a modular monolith: one Next.js web process, one single-concurrency Node worker, and one local SQLite database. UI modules contain presentation state only. Route handlers and Server Actions validate transport input and call domain services under `src/server/domain`. External systems live behind adapters in `src/server/infrastructure`.

The main write pattern is: short Prisma transaction → domain state plus a unique `OutboxJob` → commit → worker lease → external call → version-checked local result. Network calls are not made inside payment, referral, partner, or subscription transactions. Payment creation is intentionally two-phase: a local immutable price snapshot is committed, then the provider checkout is created outside the transaction; the association write is busy-retried and the local ID travels in provider payload for callback recovery where the provider returns it.

Important directories:

- `src/server/domain`: auth, billing (including pricing), subscriptions, referrals, partner, promos, support, telegram, users;
- `src/server/infrastructure`: DB, crypto, email, payments, Telegram, Remnawave, logs;
- `src/jobs`: lease/retry worker and handlers;
- `src/server/transport`: HTTP validation, cookies, and request fingerprints;
- `src/server/queries`: dashboard and administration read models;
- `app/api`: HTTP transports and provider webhooks;
- `app/admin`: admin UI and audited Server Actions;
- `prisma`: schema, versioned migrations, and idempotent seed.

The legacy internal-balance checkout and wallet/payout routes are retired. The partner module still uses `WalletAccount`, `WalletLedgerEntry`, and `PayoutRequest` for partner balances and payouts; these models and their migration history remain part of the active architecture.

Remnawave's mock provider is functional only in test mode. The production HTTP provider implements the API contract verified against Remnawave 2.8.0: deterministic username lookup/create, UUID update/read, Standard/LTE squad assignment, HWID device limit, and subscription URL rotation. It uses bounded requests, response-schema validation, and sanitized errors. Billing remains independently gated until the payment-to-usable-Node acceptance flow succeeds.
