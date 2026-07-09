# Architecture

Pulsar 2.0 is split into UI, server actions, business services, and integration adapters.

## Layers

- `app/*`: App Router pages, layouts, server actions, and route surfaces.
- `components/*`: shadcn/ui primitives and Pulsar UI composition.
- `lib/*`: database singleton, auth/session helpers, pricing, subscription presentation helpers.
- `src/server/services/*`: business services and integration boundaries.
- `prisma/*`: schema, migration, seed.

UI never calls external APIs directly. Server actions validate session and input, then call services. Services use interfaces such as `RemnawaveClient`, `PaymentProvider`, and `TelegramAuthService`.

## Domain Rules

- One user can have one current multi-subscription in the product flow.
- A subscription exposes one `subscriptionUrl` to the user.
- Multiple VPN profiles/hosts are internal and represented by features/nodes, not shown as inbound IDs.
- LTE is a paid add-on on `Subscription.lteEnabled`.
- Balance is cached on `User.balanceRub`, but `WalletLedgerEntry` is the source of history.
- Referral UX exposes a link, not a separate user-facing referral-code entity.

## Security

- No username/password auth.
- Sessions are opaque random tokens stored hashed in `Session.tokenHash`.
- Session cookie is HTTP-only, same-site lax, secure in production.
- `requireUser()` protects user server actions and pages.
- `requireAdmin()` protects admin server actions and pages.
- Technical provisioning errors are stored in `Subscription.lastTechnicalError` and `IntegrationLog`, while users see `lastUserFriendlyError`.

## Database

The Prisma schema includes all required entities:

`User`, `AuthIdentity`, `Session`, `EmailOtp`, `LoginChallenge`, `Subscription`, `SubscriptionFeature`, `DeviceLimitChange`, `Payment`, `PaymentWebhookLog`, `WalletLedgerEntry`, `ReferralProfile`, `ReferralInvite`, `ReferralReward`, `PayoutRequest`, `SupportConversation`, `SupportMessage`, `LegalDocument`, `Node`, `IntegrationLog`, `AuditLog`, `PricingSettings`.

Money is stored as integer RUB values.
