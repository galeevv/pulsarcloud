# Backend reset report

## Reason and baseline

The previous backend, database model, integrations, and business rules were
removed because Pulsar 2.0 has no production data and the backend will be
designed again. The preserved repository is now a frontend preview, not a
working commercial service.

- Source commit: `6417437c73064de69d8c44df6121909e08ea99aa`
- Checkpoint commit: `5d4b19e`
- Branch: `chore/reset-backend`

## Removed

- Database-backed auth, sessions, OTP, magic-link and Telegram login/linking.
- Pricing, quotes, payments, provider webhooks, confirmation and billing state.
- Subscription mutations, periods, URL rotation, device/LTE entitlement rules,
  provisioning and Remnawave synchronization.
- Referral onboarding/rewards, wallet ledger and payout workflows.
- Support persistence and admin reply/status mutations.
- Resend, Telegram, Platega and Remnawave adapters.
- Jobs/outbox, worker, retry, audit persistence and database health/runtime code.
- Prisma schema, migrations, config, generated client and SQLite helpers.
- Backend tests and backend-dependent deployment, backup and systemd files.
- Route handlers for payment callbacks, Telegram callbacks, Telegram completion,
  and email magic-link verification.

Removed direct dependencies: `@prisma/adapter-better-sqlite3`, `@prisma/client`,
`better-sqlite3`, `dotenv`, and `zod`. Removed development dependencies:
`@types/better-sqlite3` and `prisma`. Database, worker, migration, generation and
postinstall scripts were removed.

Removed environment variables cover database, sessions, job payloads, payment
providers, Remnawave, Telegram and email delivery. `.env.example` now contains
only the optional `PULSAR_FRONTEND_PREVIEW=true` flag. Existing local `.env` and
SQLite files were not read, changed, deleted, or committed.

All former backend tests under `tests/` were removed. They were replaced with
frontend preview smoke/guard coverage for routes, navigation, checkout overlays,
profile, support, legal files, forbidden server imports, route handlers and
secret names.

## Preserved

- User routes: `/`, `/auth/verify`, `/home`, `/subscription`, `/referrals`,
  `/profile`, `/support`, `/legal`.
- Root/dashboard layouts, bottom navigation, responsive behavior, forms,
  dialogs, drawers, cards, empty states, notifications and animations.
- shadcn/Base UI components, Tailwind styles, metadata, icons, images and GIFs.
- Static legal documents: `agreement.md`, `offer.md`, `confidentiality.md`.
- UI-specific view models and formatting helpers.

## Frontend preview layer

`src/frontend-preview` contains explicit preview configuration, UI view-model
types, formatting helpers, and read-only fixtures for user, subscription,
pricing display, referrals and support pages. `PreviewForm` prevents
submission, performs no HTTP request or write, and displays: “Действие доступно
после подключения нового backend”. Checkout confirmation explicitly says that
the backend is not connected and cannot create a real payment.

## Archived documents

Historical architecture, application reference, auth, billing, integrations,
Remnawave, testing, user business-logic and VPS reports were moved to
`docs/archive/old-backend`. Every archived file begins with the required warning
that it is not current Pulsar 2.0 architecture.

## Contracts the new backend must eventually provide

- Auth screen: request/verify email access and Telegram login; auth result.
- Profile: current user identity display, identity linking and logout commands.
- Home/subscription: subscription status, dates, device limit, LTE display,
  user-friendly error and a subscription URL; checkout and device/link commands.
- Referrals: balance, invite link, invite metrics/history and payout history;
  payout command.
- Support: ordered message view models and send-message command.
- Legal: the existing static document contract can remain file-backed.

## Remaining work and non-obvious points

The new backend must define authentication, authorization, persistence,
commercial pricing, payments, subscription lifecycle, provisioning, referrals,
wallet/payouts, support and operations from scratch. Preview amounts and records
are presentation fixtures, not accepted commercial rules or seed data. The old
`/admin` interface was removed completely and will be developed again.
`/auth/verify/link` was a handler rather than a visual page
and was removed; `/auth/verify` remains. Legal pages still read versioned local
Markdown files on the server, which is frontend content loading rather than a
production database integration.

The complete added, modified, removed, and archived file inventory is recorded
in [BACKEND_RESET_FILES.md](BACKEND_RESET_FILES.md).
