import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import { ConflictError, UnauthorizedError } from "@/lib/application-errors"
import {
  assertDeviceLimitCoveredByPayment,
  assertLteCoveredByPayment,
} from "@/lib/subscription-billing-policy"
import type { TestDatabase } from "./helpers/test-database"
import {
  createPricingVersion,
  createTestDatabase,
} from "./helpers/test-database"

let database: TestDatabase
let billing: typeof import("@/src/server/services/billing/payment-service")
let webhooks: typeof import("@/src/server/services/billing/payment-webhook-service")
let providers: typeof import("@/src/server/services/payments/provider")
let applicationDatabase: typeof import("@/lib/db")

before(async () => {
  database = await createTestDatabase("billing")
  process.env.DATABASE_URL = database.url
  process.env.PAYMENT_PROVIDER = "MOCK"
  process.env.ALLOW_MOCK_PAYMENT_PROVIDER = "true"
  process.env.MOCK_PAYMENT_WEBHOOK_SECRET = "billing-test-webhook-secret"
  applicationDatabase = await import("@/lib/db")
  billing = await import("@/src/server/services/billing/payment-service")
  webhooks =
    await import("@/src/server/services/billing/payment-webhook-service")
  providers = await import("@/src/server/services/payments/provider")
  await createPricingVersion(database.client)
})

after(async () => {
  await applicationDatabase.prisma.$disconnect()
  await database.close()
})

test("backend creates an immutable quote and ignores any client-side displayed price", async () => {
  const user = await database.client.user.create({ data: {} })
  const input = {
    userId: user.id,
    months: 1,
    deviceLimit: 3,
    lteEnabled: true,
    idempotencyKey: crypto.randomUUID(),
  }

  const first = await billing.createSubscriptionPayment(input)
  const second = await billing.createSubscriptionPayment(input)
  const quote = await database.client.priceQuote.findUniqueOrThrow({
    where: { id: first.quoteId },
  })

  assert.equal(first.id, second.id)
  assert.equal(first.status, "PENDING")
  assert.equal(first.amountRub, 199)
  assert.equal(quote.subtotalRub, 199)
  assert.equal(quote.discountRub, 0)
  assert.equal(quote.totalRub, 199)
  assert.ok(quote.expiresAt > quote.createdAt)
  assert.equal(
    await database.client.priceQuote.count({ where: { userId: user.id } }),
    1
  )
  assert.equal(
    await database.client.payment.count({ where: { userId: user.id } }),
    1
  )
  await assert.rejects(
    database.client.priceQuote.update({
      where: { id: quote.id },
      data: { totalRub: 1 },
    })
  )
})

test("confirmation is atomic and repeated confirmation creates no duplicate effects", async () => {
  const user = await database.client.user.create({ data: {} })
  const admin = await database.client.user.create({ data: { role: "ADMIN" } })
  const payment = await billing.createSubscriptionPayment({
    userId: user.id,
    months: 3,
    deviceLimit: 2,
    lteEnabled: false,
    idempotencyKey: crypto.randomUUID(),
  })

  const first = await billing.confirmMockPayment(payment.id, admin.id)
  const second = await billing.confirmMockPayment(payment.id, admin.id)

  assert.equal(first.applied, true)
  assert.equal(second.applied, false)
  assert.equal(
    await database.client.subscriptionPeriod.count({
      where: { paymentId: payment.id },
    }),
    1
  )
  assert.equal(
    await database.client.walletLedgerEntry.count({
      where: { paymentId: payment.id },
    }),
    2
  )
  assert.equal(
    await database.client.job.count({
      where: { idempotencyKey: { startsWith: `payment:${payment.id}` } },
    }),
    1
  )
  assert.equal(
    await database.client.job.count({
      where: { idempotencyKey: { contains: payment.id } },
    }),
    2
  )
  assert.equal(
    await database.client.auditEvent.count({
      where: { entityType: "Payment", entityId: payment.id },
    }),
    1
  )
  const period = await database.client.subscriptionPeriod.findUniqueOrThrow({
    where: { paymentId: payment.id },
  })
  await assert.rejects(
    database.client.subscriptionPeriod.update({
      where: { id: period.id },
      data: { amountRub: 1 },
    })
  )
})

test("signed webhook is idempotent across subscription, referral, ledger, and jobs", async () => {
  const inviter = await database.client.user.create({ data: {} })
  const invited = await database.client.user.create({ data: {} })
  await database.client.referralProfile.create({
    data: {
      userId: inviter.id,
      inviteCode: `invite-${inviter.id}`,
      isEnabled: true,
    },
  })
  await database.client.referralProfile.create({
    data: { userId: invited.id, inviteCode: `invite-${invited.id}` },
  })
  await database.client.referralInvite.create({
    data: {
      inviterId: inviter.id,
      invitedUserId: invited.id,
      inviteCodeSnapshot: `invite-${inviter.id}`,
    },
  })
  const payment = await billing.createSubscriptionPayment({
    userId: invited.id,
    months: 1,
    deviceLimit: 1,
    lteEnabled: false,
    idempotencyKey: crypto.randomUUID(),
  })
  assert.equal(payment.amountRub, 60)

  const rawBody = JSON.stringify({
    eventId: `event-${payment.id}`,
    providerPaymentId: payment.externalPaymentId,
    status: "SUCCEEDED",
    amountRub: payment.amountRub,
    currency: "RUB",
  })
  const validHeaders = new Headers({
    "x-mock-signature": providers.createMockWebhookSignature(rawBody),
  })

  await assert.rejects(
    webhooks.verifyAndProcessPaymentWebhook(
      "MOCK",
      rawBody,
      new Headers({ "x-mock-signature": "invalid" })
    ),
    UnauthorizedError
  )
  const first = await webhooks.verifyAndProcessPaymentWebhook(
    "MOCK",
    rawBody,
    validHeaders
  )
  const second = await webhooks.verifyAndProcessPaymentWebhook(
    "MOCK",
    rawBody,
    validHeaders
  )

  assert.equal(first.applied, true)
  assert.equal(second.duplicate, true)
  assert.equal(await database.client.paymentWebhookEvent.count(), 1)
  assert.equal(
    await database.client.subscriptionPeriod.count({
      where: { paymentId: payment.id },
    }),
    1
  )
  assert.equal(
    await database.client.referralReward.count({
      where: { paymentId: payment.id },
    }),
    1
  )
  assert.equal(
    await database.client.job.count({
      where: { idempotencyKey: { contains: payment.id } },
    }),
    2
  )

  const partialRefundBody = JSON.stringify({
    eventId: `refund-partial-${payment.id}`,
    providerPaymentId: payment.externalPaymentId,
    status: "PARTIALLY_REFUNDED",
    amountRub: payment.amountRub,
    refundedAmountRub: 20,
    currency: "RUB",
  })
  await webhooks.verifyAndProcessPaymentWebhook(
    "MOCK",
    partialRefundBody,
    new Headers({
      "x-mock-signature":
        providers.createMockWebhookSignature(partialRefundBody),
    })
  )
  assert.equal(
    (
      await database.client.payment.findUniqueOrThrow({
        where: { id: payment.id },
      })
    ).status,
    "PARTIALLY_REFUNDED"
  )

  const fullRefundBody = JSON.stringify({
    eventId: `refund-full-${payment.id}`,
    providerPaymentId: payment.externalPaymentId,
    status: "REFUNDED",
    amountRub: payment.amountRub,
    refundedAmountRub: payment.amountRub,
    currency: "RUB",
  })
  const fullRefundHeaders = new Headers({
    "x-mock-signature": providers.createMockWebhookSignature(fullRefundBody),
  })
  await webhooks.verifyAndProcessPaymentWebhook(
    "MOCK",
    fullRefundBody,
    fullRefundHeaders
  )
  await webhooks.verifyAndProcessPaymentWebhook(
    "MOCK",
    fullRefundBody,
    fullRefundHeaders
  )
  const refundedPayment = await database.client.payment.findUniqueOrThrow({
    where: { id: payment.id },
  })
  assert.equal(refundedPayment.status, "REFUNDED")
  assert.equal(refundedPayment.refundedAmountRub, payment.amountRub)
  assert.equal(
    await database.client.walletLedgerEntry.count({
      where: { paymentId: payment.id, type: "PAYMENT_REFUND" },
    }),
    2
  )
})

test("entitlement policy blocks unpaid device and LTE upgrades", () => {
  assert.throws(() => assertDeviceLimitCoveredByPayment(1, 2), ConflictError)
  assert.throws(() => assertLteCoveredByPayment(false, true), ConflictError)
  assert.doesNotThrow(() =>
    assertDeviceLimitCoveredByPayment(1, 3, {
      deviceLimit: 3,
      lteEnabled: true,
    })
  )
  assert.doesNotThrow(() =>
    assertLteCoveredByPayment(false, true, {
      deviceLimit: 3,
      lteEnabled: true,
    })
  )
})
