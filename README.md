# Pulsar 2.0

Pulsar 2.0 is a Next.js App Router application for VPN subscription billing,
authentication, referrals, support, and Remnawave provisioning.

Documentation index:

- [Application reference](docs/application-reference.md)
- [Architecture](docs/architecture.md)
- [Authentication](docs/auth.md)
- [Billing](docs/billing.md)
- [Integration operations](docs/integration-handoff.md)
- [Remnawave test environment](docs/remnawave-test-environment.md)
- [Repository and VPS audit](docs/audit-2026-07-12.md)
- [Testing](docs/test.md)
- [Seed data](docs/seed.md)

Clean Next.js foundation for the commercial PulsarVPN cabinet. This is a new project, not a refactor of Pulsar 1.0. Legacy backend terms, promo codes, credits, username/password auth, Marzban/x-ui artifacts, and old project structure are intentionally absent.

## Stack

- Next.js App Router, TypeScript, Tailwind v4
- shadcn/ui preset `b1VlIttI`, Base UI primitives, Lucide icons
- SQLite + Prisma 7 + `@prisma/adapter-better-sqlite3`
- Cookie-based sessions
- Server actions and route handlers
- Mobile-first dark premium UI

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

3. Apply migrations and generate Prisma Client:

```bash
npm run db:deploy
npm run db:generate
```

4. Seed demo data:

```bash
npm run db:seed
```

5. Start the web process:

```bash
npm run dev
```

Open `http://localhost:3000`.

6. Start the single background worker in another terminal:

```bash
npm run worker
```

Both processes use the same local `pulsar.db`. Startup enables WAL, foreign
keys, full synchronous durability, a 5-second busy timeout, and in-memory temp
storage. SQLite versions without the WAL-reset fix are rejected.

## Dev Login

No passwords exist. Use Email OTP.

Seed emails:

- Admin: `admin@pulsarr.space`
- Empty user: `user@pulsarr.space`
- Active subscription user: `active@pulsarr.space`
- Expired subscription user: `expired@pulsarr.space`

In development, OTP is logged to the server console and shown in the login card when `DEV_SHOW_OTP=true`.

## Routes

User routes:

- `/` auth/register
- `/home`
- `/subscription`
- `/referrals`
- `/profile`
- `/support`
- `/legal`

Admin routes:

- `/admin`
- `/admin/users`
- `/admin/subscriptions`
- `/admin/payments`
- `/admin/wallet`
- `/admin/referrals`
- `/admin/payouts`
- `/admin/support`
- `/admin/nodes`
- `/admin/integration-logs`
- `/admin/settings`

Admin is protected by `role ADMIN`. Regular users are redirected to `/home`.

## Integration modes

- Payments use Platega in production. `TEST` is an explicit self-service
  acceptance mode and `MOCK` remains available only for development/admin tests.
- Provisioning uses the Remnawave HTTP adapter in production and a mock adapter
  in automated tests.
- Email delivery uses Resend; Telegram login and profile binding use the bot
  webhook and durable update jobs.
- External calls run outside SQL transactions and are retried by the worker.

Production migrations create an active pricing baseline but never demo users.
Run `npm run db:seed` only for a disposable development database.

See `/docs/architecture.md`, `/docs/auth.md`,
`/docs/billing.md`, `/docs/integration-handoff.md`, and `/docs/seed.md`.
