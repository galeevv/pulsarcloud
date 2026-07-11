# Backend reset file inventory

Compared with source commit `6417437c73064de69d8c44df6121909e08ea99aa`.

## Deleted (68)

```text
app/(auth)/actions.ts
app/(dashboard)/actions.ts
app/(dashboard)/profile/actions.ts
app/admin/actions.ts
app/api/payments/webhook/[provider]/route.ts
app/api/telegram/webhook/route.ts
app/auth/telegram/complete/route.ts
app/auth/verify/link/route.ts
components/app/payment-form.tsx
components/app/payment-status-toast.tsx
lib/application-errors.ts
lib/auth.ts
lib/db-health.ts
lib/db.ts
lib/email-login.ts
lib/job-payload-crypto.ts
lib/pricing-data.ts
lib/pricing.ts
lib/security.ts
lib/sqlite-runtime.ts
lib/subscription-billing-policy.ts
lib/subscription.ts
lib/transactions.ts
lib/user-identity.ts
ops/Caddyfile
ops/pulsar-backup
ops/pulsar-update
ops/pulsar.env.example
ops/remnawave-backup
ops/remnawave-subscription.compose.yml
ops/remnawave-subscription.env.example
ops/systemd/pulsar-backup.service
ops/systemd/pulsar-backup.timer
ops/systemd/pulsar-update.service
ops/systemd/pulsar-web.service
ops/systemd/pulsar-worker.service
ops/systemd/remnawave-backup.service
ops/systemd/remnawave-backup.timer
prisma.config.ts
prisma/migrations/20260711120000_init/migration.sql
prisma/migrations/20260711160000_billing_state_machine/migration.sql
prisma/migrations/20260711170000_billing_immutability/migration.sql
prisma/migrations/20260711193140_test_payment_mode/migration.sql
prisma/migrations/20260711193426_referral_registration_trial/migration.sql
prisma/migrations/20260711195800_initial_active_pricing/migration.sql
prisma/migrations/migration_lock.toml
prisma/schema.prisma
src/server/services/billing/payment-service.ts
src/server/services/billing/payment-webhook-service.ts
src/server/services/email/resend-client.ts
src/server/services/payments/provider.ts
src/server/services/provisioning/subscription-provisioning-service.ts
src/server/services/referrals/referral-onboarding-service.ts
src/server/services/remnawave/client.ts
src/server/services/telegram/bot-client.ts
src/server/services/telegram/update-service.ts
src/server/services/wallet/payout-service.ts
src/server/worker.ts
tests/billing.test.ts
tests/busy-retry.test.ts
tests/constraints.test.ts
tests/helpers/test-database.ts
tests/integration-adapters.test.ts
tests/migrations.test.ts
tests/referral-onboarding.test.ts
tests/relations.test.ts
tests/singleton.test.ts
tests/transactions.test.ts
```

## Modified (38)

```text
.env.example
.gitignore
README.md
app/(dashboard)/home/page.tsx
app/(dashboard)/layout.tsx
app/(dashboard)/profile/page.tsx
app/(dashboard)/referrals/page.tsx
app/(dashboard)/subscription/page.tsx
app/(dashboard)/support/page.tsx
app/admin/integration-logs/page.tsx
app/admin/layout.tsx
app/admin/nodes/page.tsx
app/admin/page.tsx
app/admin/payments/page.tsx
app/admin/payouts/page.tsx
app/admin/referrals/page.tsx
app/admin/settings/page.tsx
app/admin/subscriptions/page.tsx
app/admin/support/page.tsx
app/admin/users/page.tsx
app/admin/wallet/page.tsx
app/page.tsx
components/admin/admin-node-form.tsx
components/app/login-methods-manager.tsx
components/app/payout-dialog.tsx
components/app/regenerate-link-dialog.tsx
components/app/setup-vpn-action.tsx
components/app/subscription-payment-action.tsx
components/app/support-composer.tsx
components/auth/auth-card.tsx
components/ui/checkbox.tsx
components/ui/input-otp.tsx
components/ui/message-scroller.tsx
components/ui/select.tsx
components/ui/sheet.tsx
components/ui/sonner.tsx
package-lock.json
package.json
```

## Added (14)

```text
components/frontend-preview/preview-form.tsx
docs/BACKEND_RESET_FILES.md
docs/BACKEND_RESET_REPORT.md
docs/NEW_BACKEND_STARTING_POINT.md
src/frontend-preview/config.ts
src/frontend-preview/fixtures/mock-admin.ts
src/frontend-preview/fixtures/mock-pricing.ts
src/frontend-preview/fixtures/mock-referrals.ts
src/frontend-preview/fixtures/mock-subscription.ts
src/frontend-preview/fixtures/mock-support.ts
src/frontend-preview/fixtures/mock-user.ts
src/frontend-preview/format.ts
src/frontend-preview/view-models.ts
tests/frontend-preview.test.ts
```

## Archived/moved (13)

All destinations are under `docs/archive/old-backend/`:

```text
docs/application-reference.md
docs/architecture.md
docs/audit-2026-07-12.md
docs/auth.md
docs/billing.md
docs/integration-handoff.md
docs/integrations.md
docs/remnawave-dev-test-policy-2026-07-11.md
docs/remnawave-test-environment.md
docs/test.md
docs/user-pages-business-logic.md
docs/vps-dev-test-report-2026-07-11.md
docs/vps-site-update-2026-07-12.md
```
