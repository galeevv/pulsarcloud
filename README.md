# Pulsar 2.0

Clean Next.js foundation for the commercial PulsarVPN cabinet. This is a new project, not a refactor of Pulsar 1.0. Legacy backend terms, promo codes, credits, username/password auth, Marzban/x-ui artifacts, and old project structure are intentionally absent.

## Stack

- Next.js App Router, TypeScript, Tailwind v4
- shadcn/ui preset `b1VlIttI`, Base UI primitives, Lucide icons
- PostgreSQL + Prisma 7
- Cookie-based sessions
- Server actions and route handlers
- Mobile-first dark premium UI

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start project Postgres in Docker:

```bash
docker compose up -d postgres
```

The project container is exposed on host port `5433` to avoid conflicts with a locally installed PostgreSQL on `5432`.

3. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

4. Apply migrations and generate Prisma Client:

```bash
npm run db:migrate
npm run db:generate
```

5. Seed demo data:

```bash
npm run db:seed
```

6. Start dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

For normal daily development, after the first setup you usually only need:

```bash
docker compose up -d postgres
npm run dev
```

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
- `/legal/[slug]`

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

## Current Mock Boundaries

- Payments use `MockPaymentProvider`; admin manually confirms pending payments.
- Provisioning uses `MockRemnawaveClient`; subscription changes go through `SubscriptionProvisioningService`.
- Telegram login has UI, `LoginChallenge`, and `MockTelegramAuthService`, but no real bot yet.
- VPN nodes are admin-managed database rows only.

## Future Integrations

- Platega: implement a real provider behind `PaymentProvider`, use `PaymentWebhookLog`, and confirm payments through webhook route handlers.
- Remnawave: implement a real `RemnawaveClient` without touching UI or server actions.
- Telegram bot: implement `TelegramAuthService`, store Telegram identities in `AuthIdentity`, and complete `LoginChallenge`.

See `/docs/architecture.md`, `/docs/auth.md`, `/docs/integrations.md`, and `/docs/seed.md`.
