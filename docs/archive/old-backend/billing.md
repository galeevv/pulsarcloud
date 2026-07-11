ARCHIVED: документ описывает удаленную реализацию backend и не является актуальной архитектурой Pulsar 2.0.

# Billing and subscription state machine

The browser submits only plan inputs (`months`, `deviceLimit`, `lteEnabled`) and
an idempotency key. It never submits an authoritative total. The backend loads
the active `PricingVersion`, applies any eligible referral discount, and creates
an immutable `PriceQuote` with a 15-minute expiry and a complete pricing
snapshot.

## Payment lifecycle

`CREATED -> PENDING -> SUCCEEDED`

Terminal and post-payment states are `FAILED`, `CANCELED`, `REFUNDED`, and
`PARTIALLY_REFUNDED`. Commercial payment terms are immutable at the SQLite
level. The development mock can be confirmed manually; non-mock payments can
only advance through a verified provider webhook.

## Webhook

Provider adapters verify signatures and normalize events. The route is:

`POST /api/payments/webhook/{provider}`

For the development mock, sign the exact raw JSON body with HMAC-SHA256 using
`MOCK_PAYMENT_WEBHOOK_SECRET` and send the hex digest in
`x-mock-signature`. The payload contains `eventId`, `providerPaymentId`,
`status`, `amountRub`, `currency: "RUB"`, and for refunds the cumulative
`refundedAmountRub`.

`PaymentWebhookEvent` is unique by provider event id and payload hash. A replay
of the same verified event returns success without recreating a subscription
period, referral reward, ledger entry, job, or audit event.

## Successful confirmation

One short transaction conditionally moves the payment to `SUCCEEDED`, consumes
the quote, creates or extends the subscription from `max(now, expiresAt)`,
creates an immutable period, applies paid device/LTE entitlements, qualifies the
referral, writes ledger entries, and enqueues provisioning and receipt jobs.
External email, Telegram, payment-provider, and Remnawave calls are always
outside that transaction.

Device-limit increases and LTE enablement are allowed only when covered by an
already successful `SubscriptionPeriod`; otherwise the user must complete a new
billing checkout.
