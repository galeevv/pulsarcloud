# Admin

Run `npm run db:bootstrap-admin` after migrations. It binds `ADMIN_EMAIL` and `ADMIN_TELEGRAM_ID` to exactly one ADMIN user, creates missing service records, and aborts rather than merging conflicts.

`/admin` uses a distinct ADMIN session and provides day/week/month metrics and worker/outbox state; searchable/paginated/filterable users plus a full user-details view; session revoke, block/unblock, idempotent manual subscription extension, wallet adjustment with reason, provisioning retry, and confirmed URL rotation; payment snapshots/webhook history/filter/reconciliation; atomic payout and refund/reward-review transitions; support replies/open/close; failed/dead job retry; full pricing settings; and Telegram draft/preview/queue/cancel/statistics. Mutations re-check authorization server-side and write `AuditLog`.

Only masked payout details appear in the list. Full details remain AES-256-GCM encrypted at rest and every reveal is audited with `Cache-Control: no-store`. Test utilities exist at `/admin/test` only while test mode is enabled: marked users and OTP, payment plus duplicate event, Telegram login, referral-to-first-payment, payout, provisioning failure/expiry, and confirmed deletion restricted to non-admin `isTest=true` users.
