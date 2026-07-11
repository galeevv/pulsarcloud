# Pulsar 2.0 frontend

Pulsar 2.0 currently contains the preserved Next.js App Router frontend for a
commercial VPN service. The previous backend and business logic were removed
and will be rebuilt separately.

## What is available

- User routes: `/`, `/auth/verify`, `/home`, `/subscription`, `/referrals`,
  `/profile`, `/support`, and `/legal`.
- Existing admin routes under `/admin`.
- The original responsive layout, navigation, shadcn/Base UI components,
  forms, dialogs, drawers, styles, animations, and public assets.
- Read-only fixtures under `src/frontend-preview` for visual review.

Preview actions never send HTTP requests, set cookies, write data, or call an
external provider. They display a message that the action will become available
after the new backend is connected.

## Local development

```bash
npm ci
npm run dev
```

`PULSAR_FRONTEND_PREVIEW=true` is optional in development and documents the
intended local mode. Production builds remain safe: they use read-only display
fixtures and do not imitate working authentication, payments, provisioning, or
support persistence.

## Checks

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
```

See [Backend reset report](docs/BACKEND_RESET_REPORT.md) and
[New backend starting point](docs/NEW_BACKEND_STARTING_POINT.md). Historical
backend documents are retained in `docs/archive/old-backend` and are explicitly
marked as archived.
