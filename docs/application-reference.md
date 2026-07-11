# Pulsar 2.0 application reference

## Runtime

Pulsar is a Next.js 16 App Router application using strict TypeScript, Prisma 7,
`@prisma/adapter-better-sqlite3`, one SQLite database, one web process, and one
background worker. External calls are executed by durable `Job` handlers after
the domain transaction commits.

## Authentication

### Email

1. The web action normalizes and validates the email.
2. A six-digit OTP and a random magic-link token are created.
3. Only hashes are stored in `AuthChallenge`; delivery data is encrypted in the
   outbox payload.
4. Resend sends the message outside the SQL transaction.
5. OTP or magic-link consumption is conditional and single-use.
6. A server-side `Session` is created for 180 days by default.

OTP and magic links expire after 10 minutes. Five failed OTP attempts cancel the
challenge.

### Telegram

The website creates a single-use challenge and opens
`t.me/pulsarcloud_bot?start=login_<nonce>`. Telegram updates enter through
`/api/telegram/webhook`, are authenticated using Telegram's webhook secret, and
are deduplicated by `update_id`. The worker links or creates the Telegram
identity and sends a completion link. The completion link consumes the challenge
and creates the web session.

### Linking identities

An authenticated user can link a missing email or Telegram identity on
`/profile`. Email linking uses a separate OTP challenge. Telegram linking stores
the current `userId` on the challenge, preventing creation of another account.
The database prevents two email or Telegram identities of the same provider on
one user and prevents one provider subject from belonging to two users.

## Referral onboarding

A valid referral registration is one atomic transaction:

- create a converted `ReferralInvite`;
- create a three-day `TRIAL` subscription and immutable period;
- enqueue Remnawave provisioning;
- create a registration `ReferralReward` using the active pricing version;
- post the wallet ledger entry and update the inviter balance;
- write an audit event.

The current business value is 75 RUB and is editable through a new immutable
`PricingVersion`. Immediate rewards are vulnerable to referral farming; payout
should be held behind antifraud or first live payment before public launch.

## Billing

Migrations install one production-safe active pricing baseline: 119 RUB per
month, 50 RUB per additional device, 50 RUB for LTE, and the configured duration
discounts. It contains no demo users or financial records. Every later admin
change retires the active version and creates a new immutable version.

The browser never supplies a trusted final amount. The server reads the active
`PricingVersion`, validates duration/device/LTE selections, calculates a total,
and stores an immutable `PriceQuote` snapshot. A payment copies the quote terms.

Providers:

- `PLATEGA`: live RUB/SBP payments;
- `TEST`: explicit self-service test checkout;
- `MOCK`: development/admin testing retained for automated tests.

`TEST` payments run the same subscription and Remnawave workflow, but related
payments, periods, and ledger entries are marked `isTest`. They are excluded from
live turnover and do not qualify referrals. Production requires the explicit
`ENABLE_TEST_PAYMENTS=true` flag.

Payment confirmation conditionally transitions the payment, extends from
`max(now, expiresAt)`, creates one immutable period, posts ledger entries,
enqueues provisioning and notifications, and writes an audit event in one short
transaction. Provider HTTP calls never run inside that transaction.

## Subscription and provisioning

Each Pulsar user maps to one deterministic Remnawave UUID. Provisioning updates
that user instead of creating a replacement. Pulsar sends:

- expiry date;
- unlimited traffic with `NO_RESET`;
- paid HWID device limit;
- standard squad always;
- LTE squad only for LTE entitlement;
- email and Telegram metadata where available.

The worker retries failed provisioning. Subscription state records both a
user-facing and technical error. HWID device listing/deletion is implemented in
the adapter; user-facing device management remains an integration follow-up.

## Wallet and payouts

Wallet history is append-only and uses unique idempotency keys. Payout requests
atomically reserve balance. Rejection releases the reservation. The configured
minimum payout is part of the active pricing version.

## Support

Users write to one open `SupportConversation`. Messages are persisted and admin
operators can reply or close/reopen conversations. Support has no external HTTP
dependency.

## Admin

`/admin` requires `UserRole.ADMIN`. It provides users, subscriptions, payments,
wallet, referrals, payouts, support, nodes, integration logs, and settings.
Pricing edits retire the active version and create a new version, preserving all
historical quote snapshots. Settings include base price, device/LTE prices,
device bounds, duration discounts, referral reward, friend discount, and payout
minimum.

Admin entitlement mutations persist state and enqueue Remnawave sync after
commit. Secret values are never shown in admin.

## Background jobs

The single worker conditionally claims pending jobs and handles email, receipts,
expiry notices, Telegram updates, provisioning, synchronization, URL rotation,
and maintenance. Job idempotency keys prevent duplicate domain effects.

## Security boundaries

- SQLite, Next.js, Remnawave API, Node API, PostgreSQL, and Valkey bind only to
  localhost or an internal Docker network.
- Caddy is the only public HTTP entry point.
- Payment and Telegram callbacks authenticate before mutation.
- Test payments require an explicit server flag and authenticated ownership.
- Secrets belong in `/etc/pulsar/pulsar.env`, never Git.
