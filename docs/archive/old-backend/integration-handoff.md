ARCHIVED: документ описывает удаленную реализацию backend и не является актуальной архитектурой Pulsar 2.0.

# Production integration operations

Pulsar commits domain state and durable `Job` records before any external I/O.
The single background worker performs Telegram, Resend, and Remnawave calls
after commit. Platega payment creation is also outside the quote transaction.
Secrets live only in `/etc/pulsar/pulsar.env` on the VPS.

## Current VPS status

- Telegram bot `@pulsarcloud_bot`: token installed, secret webhook configured at
  `https://pulsar-cloud.space/api/telegram/webhook`, commands registered.
- Resend: production adapter and domain sender configured. A real OTP delivery
  still needs a mailbox acceptance test after credentials are rotated.
- Platega: RUB/SBP adapter is selected as the live provider. The merchant cabinet
  must use `https://pulsar-cloud.space/api/payments/webhook/platega` as its POST
  callback URL. Run a low-value acceptance payment before public launch.
- Remnawave: HTTP adapter is enabled; standard and LTE squads are configured.
  The same-VPS node is the current topology, not the final LTE topology.

## Email acceptance

1. Confirm the Resend domain remains verified and DKIM/SPF records are healthy.
2. Request an OTP for a real mailbox and check delivery, sender, and spam folder.
3. Verify OTP and magic-link expiry are ten minutes and the session is 180 days.
4. Verify bounce/error behaviour in worker logs without logging OTP values.

## Telegram acceptance

1. Open `@pulsarcloud_bot` through the site's Telegram login button.
2. Send the generated `/start login_...` command and follow the returned button.
3. Test `/subscription`, `/connect`, and `/help` after linking.
4. Repeat from `/profile` to verify identity binding and conflict handling.

Telegram `update_id`, `AuthChallenge`, jobs, and identities provide replay and
idempotency boundaries. Never configure a webhook without its secret token.

## Platega acceptance

1. Configure the callback URL shown above in the merchant cabinet.
2. Create one low-value SBP payment and confirm amount/currency against the
   immutable server quote.
3. Replay the callback and verify no duplicate period, ledger entry, referral
   reward, provisioning job, or audit event is created.
4. Test failed/cancelled and delayed callbacks. Refund support is not offered by
   the current merchant setup and must not be shown as available.

## Remnawave acceptance

Follow [Remnawave test environment](remnawave-test-environment.md). The verified
test path is payment confirmation → subscription period → outbox job → stable
Remnawave user → subscription URL. Device removal UI remains follow-up work even
though adapter methods exist.

## Admin bootstrap

`/admin` requires `User.role=ADMIN`; migrations deliberately create no demo
admin. Register the intended owner through verified email or Telegram, then have
an operator promote that exact user once. Do not create a shared admin password.

## Deployment checklist

- Keep exactly one web process and one worker on the same local persistent
  directory containing `pulsar.db`, `pulsar.db-wal`, and `pulsar.db-shm`.
- Run `prisma migrate deploy` before process restart and keep the automatic
  pre-deploy SQLite snapshot.
- Check `PRAGMA integrity_check`, `foreign_key_check`, WAL mode, and
  `synchronous=FULL` after migrations.
- Rotate Telegram, Resend, Platega, and Remnawave credentials after acceptance;
  update the VPS env and restart both Pulsar services.
- Do not put Pulsar SQLite on a network filesystem or add a second web/worker
  replica without redesigning storage and concurrency.
