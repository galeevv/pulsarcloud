# Architecture

Pulsar is a modular monolith: one Next.js web process, one single-concurrency Node worker, and one local SQLite database. UI modules contain presentation state only. Route handlers and Server Actions validate transport input and call domain services under `src/server/domain`. External systems live behind adapters in `src/server/infrastructure`.

The main write pattern is: short Prisma transaction → domain state plus a unique `OutboxJob` → commit → worker lease → external call → version-checked local result. Network calls are not made inside payment, referral, wallet, or subscription transactions. Payment creation is intentionally two-phase: a local immutable price snapshot is committed, then the provider checkout is created outside the transaction; the association write is busy-retried and the local ID travels in provider payload for callback recovery where the provider returns it.

Important directories:

- `src/server/domain`: auth, pricing/billing, referrals, wallet, support, users;
- `src/server/infrastructure`: DB, crypto, email, payments, Telegram, Remnawave, logs;
- `src/jobs`: lease/retry worker and handlers;
- `src/server/transport`: cookies and request fingerprints;
- `app/api`: HTTP transports and provider webhooks;
- `app/admin`: admin UI and audited Server Actions;
- `prisma`: schema, generated migration, and idempotent seed.

Remnawave's mock provider is functional only in test mode. The production HTTP provider implements the API contract verified against Remnawave 2.8.0: deterministic username lookup/create, UUID update/read, Standard/LTE squad assignment, HWID device limit, and subscription URL rotation. It uses bounded requests, response-schema validation, and sanitized errors. Billing remains independently gated until the payment-to-usable-Node acceptance flow succeeds.
