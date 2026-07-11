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

4. Start the web process:

```bash
npm run dev
```

Open `http://localhost:3000`.

5. Start the single background worker in another terminal:

```bash
npm run worker
```

Both processes use the same local `pulsar.db`. Startup enables WAL, foreign
keys, full synchronous durability, a 5-second busy timeout, and in-memory temp
storage. SQLite versions without the WAL-reset fix are rejected.

## Login

No passwords exist. Users authenticate with a Resend-delivered email OTP or a
Telegram deep link. OTP values and magic links are never shown or logged.

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

- Payments use Platega.
- Provisioning uses the Remnawave HTTP adapter.
- Email delivery uses Resend; Telegram login and profile binding use the bot
  webhook and durable update jobs.
- External calls run outside SQL transactions and are retried by the worker.

Migrations create an active pricing baseline but never demo users.

See `/docs/architecture.md`, `/docs/auth.md`, `/docs/billing.md`, and
`/docs/integration-handoff.md`.
