# Pulsar 2.0

Production-oriented modular monolith for a commercial VPN control panel. The Next.js 16 application includes passwordless email and Telegram auth, SQLite/Prisma, subscription billing, Platega and test payment providers, referrals, wallet payouts, support, an admin panel, Telegram notifications, a durable outbox worker, and an isolated test mode.

## Requirements

- Node.js 20.19+, 22.12+, or 24 (Prisma 7 requirement); Node 24 is used in development.
- npm 11 (`package-lock.json` is authoritative).
- Windows 10/11 for local instructions, or Ubuntu 24.04 for production.
- `sqlite3` CLI for production backup/restore scripts.

## Windows local setup

```powershell
Set-Location D:\Web3\pulsarcloud
npm run setup:local
npm run dev:local
```

`npm run setup:local` creates `.env` from `.env.example` when needed, writes a repository-relative SQLite URL that works with Prisma on Windows, enables only the test payment/mock Remnawave adapters, installs locked dependencies, deploys migrations, and runs the idempotent pricing/admin seed. Valid secrets in an existing development env are preserved; missing/example secrets are generated. Before updating an existing development env the script creates a Git-ignored backup. It refuses to touch an existing env that contains `APP_ENV=production`, has no explicit `APP_ENV`, or contains an invalid custom secret. `npm run dev:local` starts both the Next.js application and the outbox worker; press `Ctrl+C` once to stop both processes.

Manual equivalents:

```powershell
npm ci --include=dev
npm run db:generate
npm run db:deploy
npm run db:seed:pricing
npm run db:bootstrap-admin
npm run dev           # terminal 1
npm run dev:worker    # terminal 2
```

Open `http://localhost:3000`. A public HTTPS tunnel is needed only to receive real Telegram/Platega webhooks locally; any tunnel provider is acceptable. Configure its URL in the respective provider dashboard.

## Tests and checks

Tests always recreate `prisma/test.db` themselves and never open the dev database.

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

## Test mode

Set `PULSAR_TEST_MODE=true`, `PAYMENT_PROVIDER=test`, and `REMNAWAVE_PROVIDER=mock`, then restart web and worker. OTP is returned only by test-mode auth responses, checkout uses `/test/checkout/...`, and `/admin/test` becomes available. Set `PULSAR_TEST_MODE=false` to remove every test route/UI capability. Production refuses test mode unless the dangerous override is present **and** `DATABASE_URL` names an isolated test database; real/test identity and money paths still cannot cross.

## Production

Create the protected production environment before building, then build on Ubuntu (or a Linux CI runner) with `npm ci --include=dev`; do not copy a Windows `.next` or native `node_modules` directory to the VPS. Install the templates under `deploy/systemd` and `deploy/nginx`. The complete Ubuntu 24.04 procedure, atomic releases, rollback, TLS bootstrap, firewall, webhooks, and Remnawave port policy are in [docs/DEPLOY_VPS.md](docs/DEPLOY_VPS.md).

The original 2 vCPU/4 GB host is suitable for Pulsar alone. For a production co-location with Remnawave Panel, use at least 8 GB RAM (or put Remnawave on a separate VPS); the panel itself officially recommends 4 GB before Pulsar, PostgreSQL/Redis, and build headroom are counted.

## Required production credentials

- strong independent `SESSION_SECRET`, `AUTH_PEPPER`, and 64-hex-character `DATA_ENCRYPTION_KEY`;
- Resend API key and verified sender;
- Telegram bot token, username, and webhook secret;
- Platega merchant ID and secret;
- after Remnawave is installed: its confirmed API base URL/token and method contract.

Keep `BILLING_ENABLED=false` until the Platega callback/status flow and the completed real Remnawave boundary pass the documented sandbox acceptance test.

See `.env.example` and the topic documents in `docs/`.
