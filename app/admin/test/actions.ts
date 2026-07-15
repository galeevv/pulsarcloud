"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { BusinessError } from "@/src/server/application/errors"
import {
  completeTelegramStart,
  requestEmailChallenge,
  requestTelegramChallenge,
  verifyEmailChallenge,
} from "@/src/server/domain/auth/service"
import {
  applyPaymentEvent,
  createCheckout,
  getCheckoutExpectation,
} from "@/src/server/domain/billing/service"
import { createUserGraph } from "@/src/server/domain/users/service"
import { createPayout } from "@/src/server/domain/wallet/service"
import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { correlationId } from "@/src/server/infrastructure/security/crypto"
import { requireWebSession } from "@/src/server/transport/web/session"

async function guard() {
  if (!getConfig().testMode) throw new Error("Not found")
  return requireWebSession("ADMIN")
}

async function audit(
  actorId: string,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: unknown
) {
  await db.auditLog.create({
    data: {
      actorType: "ADMIN",
      actorId,
      action,
      entityType,
      entityId,
      metadataJson: metadata === undefined ? null : JSON.stringify(metadata),
      correlationId: correlationId(),
    },
  })
}

async function getTestUser(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user?.isTest || user.role !== "USER")
    throw new BusinessError("AUTH_FORBIDDEN", 403)
  return user
}

export async function createTestUser(formData: FormData) {
  const session = await guard()
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!email.endsWith("@pulsar.local") || email.length > 254)
    throw new Error("Test email must use @pulsar.local")
  const user = await db.$transaction(async (tx) => {
    const existing = await tx.authIdentity.findUnique({
      where: { emailNormalized: email },
      include: { user: true },
    })
    if (existing) {
      if (!existing.user.isTest) throw new Error("Identity is not test data")
      return existing.user
    }
    const created = await createUserGraph(tx, { isTest: true })
    await tx.authIdentity.create({
      data: {
        userId: created.id,
        provider: "EMAIL",
        providerSubject: email,
        emailNormalized: email,
        verifiedAt: new Date(),
      },
    })
    return created
  })
  await audit(session.userId, "TEST_USER_CREATED", "User", user.id, { email })
  revalidatePath("/admin/test")
}

export async function requestTestOtp(formData: FormData) {
  const session = await guard()
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!email.endsWith("@pulsar.local")) throw new Error("Test email required")
  const result = await requestEmailChallenge({ email })
  await audit(
    session.userId,
    "TEST_OTP_REQUESTED",
    "LoginChallenge",
    result.challengeId
  )
  revalidatePath("/admin/test")
}

export async function createAndConfirmTestPayment(formData: FormData) {
  const session = await guard()
  const userId = String(formData.get("userId"))
  await getTestUser(userId)
  const selection = {
    userId,
    durationMonths: 1,
    deviceLimit: 1,
    lteEnabled: false,
  }
  const payment = await createCheckout({
    ...selection,
    ...(await getCheckoutExpectation(selection)),
    idempotencyKey: `admin-test-payment:${randomUUID()}`,
  })
  await applyPaymentEvent({
    eventId: `admin-test-confirm:${payment.id}`,
    eventType: "CONFIRMED",
    externalPaymentId: payment.externalPaymentId!,
    status: "CONFIRMED",
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    payload: {
      id: payment.externalPaymentId,
      status: "CONFIRMED",
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      payload: payment.id,
    },
  })
  await audit(session.userId, "TEST_PAYMENT_CONFIRMED", "Payment", payment.id)
  revalidatePath("/admin/test")
}

export async function resendDuplicatePaymentEvent(formData: FormData) {
  const session = await guard()
  const paymentId = String(formData.get("paymentId"))
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
  })
  if (
    !payment.isTest ||
    payment.status !== "CONFIRMED" ||
    !payment.externalPaymentId
  )
    throw new Error("Confirmed test payment required")
  const webhook = await db.paymentWebhookLog.findFirstOrThrow({
    where: { paymentId: payment.id, eventType: "CONFIRMED" },
    orderBy: { receivedAt: "asc" },
  })
  await applyPaymentEvent({
    eventId: webhook.eventId,
    eventType: "CONFIRMED",
    externalPaymentId: payment.externalPaymentId,
    status: "CONFIRMED",
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    payload: { duplicate: true, payload: payment.id },
  })
  await audit(
    session.userId,
    "TEST_PAYMENT_DUPLICATE_SENT",
    "Payment",
    payment.id
  )
  revalidatePath("/admin/test")
}

export async function simulateTelegramLogin() {
  const session = await guard()
  if (!getConfig().localAuthAdaptersEnabled)
    throw new BusinessError("NOT_FOUND", 404)
  const challenge = await requestTelegramChallenge({})
  const challengeUrl = new URL(challenge.url)
  const startToken =
    challengeUrl.searchParams.get("token") ??
    challengeUrl.searchParams.get("start")
  if (!startToken) throw new Error("Telegram start token missing")
  const telegramId = String(
    8_000_000_000 + Math.floor(Math.random() * 900_000_000)
  )
  const result = await completeTelegramStart({
    rawStartToken: startToken,
    telegramId,
    username: `pulsar_test_${telegramId.slice(-6)}`,
    chatId: telegramId,
  })
  await audit(
    session.userId,
    "TEST_TELEGRAM_LOGIN_SIMULATED",
    "User",
    result.userId
  )
  revalidatePath("/admin/test")
}

export async function simulateReferralFirstPayment(formData: FormData) {
  const session = await guard()
  const inviterUserId = String(formData.get("userId"))
  await getTestUser(inviterUserId)
  const profile = await db.referralProfile.update({
    where: { userId: inviterUserId },
    data: { isEnabled: true, enabledAt: new Date() },
  })
  const email = `ref-${Date.now()}-${Math.floor(Math.random() * 10_000)}@pulsar.local`
  const requested = await requestEmailChallenge({
    email,
    inviteCode: profile.inviteCode,
  })
  if (!requested.devOtp) throw new Error("Test OTP is unavailable")
  const login = await verifyEmailChallenge({
    challengeId: requested.challengeId,
    otp: requested.devOtp,
  })
  const selection = {
    userId: login.userId,
    durationMonths: 1,
    deviceLimit: 1,
    lteEnabled: false,
  }
  const payment = await createCheckout({
    ...selection,
    ...(await getCheckoutExpectation(selection)),
    idempotencyKey: `admin-test-referral:${randomUUID()}`,
  })
  await applyPaymentEvent({
    eventId: `admin-test-referral-confirm:${payment.id}`,
    eventType: "CONFIRMED",
    externalPaymentId: payment.externalPaymentId!,
    status: "CONFIRMED",
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    payload: { payload: payment.id, status: "CONFIRMED" },
  })
  await audit(
    session.userId,
    "TEST_REFERRAL_FLOW_SIMULATED",
    "Payment",
    payment.id,
    {
      inviterUserId,
      invitedUserId: login.userId,
    }
  )
  revalidatePath("/admin/test")
}

export async function createTestPayout(formData: FormData) {
  const session = await guard()
  const userId = String(formData.get("userId"))
  await getTestUser(userId)
  const pricing = await db.pricingSettings.findUniqueOrThrow({
    where: { key: "default" },
  })
  const creditKey = `admin-test-payout-credit:${randomUUID()}`
  await db.$transaction(async (tx) => {
    const wallet = await tx.walletAccount.update({
      where: { userId },
      data: {
        availableMinor: { increment: pricing.minimalPayoutMinor },
        version: { increment: 1 },
      },
    })
    await tx.walletLedgerEntry.create({
      data: {
        walletAccountId: wallet.id,
        userId,
        type: "ADMIN_ADJUSTMENT",
        deltaAvailableMinor: pricing.minimalPayoutMinor,
        deltaReservedMinor: 0,
        referenceType: "TestMode",
        referenceId: creditKey,
        idempotencyKey: creditKey,
        description: "Test payout fixture",
      },
    })
  })
  const payout = await createPayout({
    userId,
    amountMinor: pricing.minimalPayoutMinor,
    details: "TEST BANK 0000000000000000",
    idempotencyKey: `admin-test-payout:${randomUUID()}`,
  })
  await audit(session.userId, "TEST_PAYOUT_CREATED", "PayoutRequest", payout.id)
  revalidatePath("/admin/test")
}

export async function setProvisioningFailure(formData: FormData) {
  const session = await guard()
  const enabled = formData.get("enabled") === "true"
  await db.systemState.upsert({
    where: { key: "test_provisioning_failure" },
    create: {
      key: "test_provisioning_failure",
      valueJson: JSON.stringify({ enabled }),
    },
    update: { valueJson: JSON.stringify({ enabled }) },
  })
  await audit(
    session.userId,
    "TEST_PROVISIONING_FAILURE_SET",
    "SystemState",
    "test_provisioning_failure",
    { enabled }
  )
  revalidatePath("/admin/test")
}

export async function expireTestSubscriptions() {
  const session = await guard()
  const users = await db.user.findMany({
    where: { isTest: true, role: "USER" },
    select: { id: true },
  })
  const result = await db.subscription.updateMany({
    where: { userId: { in: users.map((user) => user.id) } },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  })
  await audit(
    session.userId,
    "TEST_SUBSCRIPTIONS_EXPIRED",
    "Subscription",
    undefined,
    {
      count: result.count,
    }
  )
  revalidatePath("/admin/test")
}

export async function deleteTestData(formData: FormData) {
  const session = await guard()
  if (String(formData.get("confirmation")) !== "DELETE TEST DATA")
    throw new Error("Type DELETE TEST DATA to confirm")
  const users = await db.user.findMany({
    where: { isTest: true, role: "USER" },
    select: { id: true },
  })
  const userIds = users.map((user) => user.id)
  if (!userIds.length) return
  await db.$transaction(async (tx) => {
    const subscriptions = await tx.subscription.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    })
    const payments = await tx.payment.findMany({
      where: { userId: { in: userIds }, isTest: true },
      select: { id: true },
    })
    const conversations = await tx.supportConversation.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    })
    const subscriptionIds = subscriptions.map((item) => item.id)
    const paymentIds = payments.map((item) => item.id)
    const conversationIds = conversations.map((item) => item.id)
    const identities = await tx.authIdentity.findMany({
      where: { userId: { in: userIds } },
      select: { emailNormalized: true, telegramId: true },
    })
    const challengeIds = (
      await tx.loginChallenge.findMany({
        where: {
          OR: [
            { requestedByUserId: { in: userIds } },
            { emailNormalized: { endsWith: "@pulsar.local" } },
            {
              emailNormalized: {
                in: identities.flatMap((item) =>
                  item.emailNormalized ? [item.emailNormalized] : []
                ),
              },
            },
            {
              telegramId: {
                in: identities.flatMap((item) =>
                  item.telegramId ? [item.telegramId] : []
                ),
              },
            },
          ],
        },
        select: { id: true },
      })
    ).map((item) => item.id)
    await tx.telegramBroadcastDelivery.deleteMany({
      where: { userId: { in: userIds } },
    })
    await tx.supportMessage.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { senderUserId: { in: userIds } },
        ],
      },
    })
    await tx.supportConversation.deleteMany({
      where: { id: { in: conversationIds } },
    })
    await tx.payoutRequest.deleteMany({ where: { userId: { in: userIds } } })
    await tx.walletLedgerEntry.deleteMany({
      where: { userId: { in: userIds } },
    })
    await tx.referralReward.deleteMany({
      where: {
        OR: [
          { inviterUserId: { in: userIds } },
          { invitedUserId: { in: userIds } },
        ],
      },
    })
    await tx.trialGrant.deleteMany({ where: { userId: { in: userIds } } })
    await tx.referralInvite.deleteMany({
      where: {
        OR: [
          { inviterUserId: { in: userIds } },
          { invitedUserId: { in: userIds } },
        ],
      },
    })
    await tx.paymentWebhookLog.deleteMany({
      where: { paymentId: { in: paymentIds } },
    })
    await tx.subscriptionEvent.deleteMany({
      where: {
        OR: [
          { subscriptionId: { in: subscriptionIds } },
          { paymentId: { in: paymentIds } },
        ],
      },
    })
    await tx.payment.deleteMany({ where: { id: { in: paymentIds } } })
    await tx.subscription.deleteMany({ where: { id: { in: subscriptionIds } } })
    await tx.outboxJob.deleteMany({
      where: {
        OR: [
          { aggregateId: { in: userIds } },
          { aggregateId: { in: paymentIds } },
          { aggregateId: { in: subscriptionIds } },
          { aggregateId: { in: challengeIds } },
        ],
      },
    })
    await tx.loginChallenge.deleteMany({ where: { id: { in: challengeIds } } })
    await tx.user.deleteMany({
      where: { id: { in: userIds }, isTest: true, role: "USER" },
    })
  })
  await audit(session.userId, "TEST_DATA_DELETED", "User", undefined, {
    count: userIds.length,
  })
  revalidatePath("/admin/test")
}
