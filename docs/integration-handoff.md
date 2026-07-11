# Production integration handoff

The local foundation intentionally does not contact Telegram, an email provider,
Platega, or Remnawave. The web process commits domain state and a durable `Job`;
the single background worker performs external I/O after that transaction.

## Email

- Choose a transactional email provider and add its credentials to deployment
  secrets, never to the repository.
- Implement the `SEND_AUTH_EMAIL` job handler.
- Encrypt the short-lived OTP/magic-link delivery payload, or generate a
  separately protected delivery secret. Do not store reusable plaintext login
  secrets in `Job.payload`.
- Add provider sandbox tests, bounce handling, rate limits, and delivery audit
  events. Keep auth challenge consumption atomic in the database.

## Telegram

- Create the bot with BotFather and configure a secret webhook endpoint.
- Verify the webhook secret, insert every update into `TelegramUpdate` using
  Telegram `update_id` as the idempotency boundary, then enqueue
  `PROCESS_TELEGRAM_UPDATE`.
- The worker must link an `AuthIdentity(provider=TELEGRAM)` only after checking
  the pending `AuthChallenge`. Test replayed and out-of-order updates.

## Payments / Platega

- Implement a real `PaymentProvider` adapter and a POST webhook route.
- Verify the provider signature before persisting the event. Insert
  `PaymentWebhookEvent` using `(provider, providerEventId)` and `payloadHash`;
  duplicate delivery must return success without reapplying the payment.
- Match provider amount/currency against the immutable `PriceQuote` and
  `Payment`. Confirmation, subscription period, wallet entries, referral reward,
  job enqueue, and audit event remain one short SQL transaction.
- Run provider sandbox tests for success, failure, cancellation, chargeback,
  duplicate delivery, and delayed delivery.

## Remnawave

- Implement the real `RemnawaveClient` and handle `PROVISION_SUBSCRIPTION` and
  `SYNC_SUBSCRIPTION` in the worker.
- Use a stable Pulsar subscription/user id as the remote idempotency key.
- Perform the HTTP call outside SQL transactions. Persist the result in a short
  transaction using `Subscription.version` for optimistic concurrency.
- Test create/update/revoke, URL regeneration, timeouts, retries, and a response
  arriving after a newer subscription change.

## Deployment checklist

- One web process and one worker process must mount the same local persistent
  directory containing `pulsar.db`, `pulsar.db-wal`, and `pulsar.db-shm`.
- Do not place the database on a network filesystem and do not run multiple web
  or worker replicas without revisiting the storage design.
- Run `prisma migrate deploy` before starting either process, configure backups,
  and test restore regularly.
- Confirm startup reports SQLite 3.51.3+ (or an official fixed backport) and all
  required PRAGMAs.
