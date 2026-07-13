"use server"
import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"
import { correlationId } from "@/src/server/infrastructure/security/crypto"
import { transitionPayout } from "@/src/server/domain/wallet/service"

async function admin() {
  return requireWebSession("ADMIN")
}

export async function setUserStatus(formData: FormData) {
  const session = await admin()
  const userId = String(formData.get("userId"))
  const status =
    String(formData.get("status")) === "BLOCKED" ? "BLOCKED" : "ACTIVE"
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } })
    if (status === "BLOCKED")
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: `USER_${status}`,
        entityType: "User",
        entityId: userId,
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function revokeUserSessions(formData: FormData) {
  const session = await admin()
  const userId = String(formData.get("userId"))
  await db.$transaction(async (tx) => {
    const revoked = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "USER_SESSIONS_REVOKED",
        entityType: "User",
        entityId: userId,
        metadataJson: JSON.stringify({ revokedCount: revoked.count }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function extendSubscription(formData: FormData) {
  const session = await admin()
  const userId = String(formData.get("userId"))
  const days = Math.max(1, Math.min(3650, Number(formData.get("days"))))
  const deviceLimit = Math.max(
    1,
    Math.min(5, Number(formData.get("deviceLimit")) || 1)
  )
  const requestedLte = formData.get("lteEnabled")
  const requestKey = String(formData.get("requestKey") ?? "")
  if (requestKey.length < 8 || requestKey.length > 200)
    throw new Error("Invalid subscription extension key")
  await db.$transaction(async (tx) => {
    const eventKey = `admin-extend:${requestKey}`
    if (
      await tx.subscriptionEvent.findUnique({
        where: { idempotencyKey: eventKey },
      })
    )
      return
    const current = await tx.subscription.findUnique({ where: { userId } })
    const lteEnabled =
      requestedLte === null
        ? (current?.lteEnabled ?? false)
        : requestedLte === "on" || requestedLte === "true"
    const now = new Date()
    const expiresAt = new Date(
      Math.max(now.getTime(), current?.expiresAt.getTime() ?? 0) +
        days * 86_400_000
    )
    const syncVersion = (current?.syncVersion ?? 0) + 1
    const subscription = current
      ? await tx.subscription.update({
          where: { id: current.id },
          data: {
            status: "ACTIVE",
            expiresAt,
            deviceLimit,
            lteEnabled,
            nextDeviceLimit: null,
            nextLteEnabled: null,
            nextParametersAt: null,
            syncStatus: "PENDING",
            syncVersion,
          },
        })
      : await tx.subscription.create({
          data: {
            userId,
            status: "ACTIVE",
            startedAt: now,
            expiresAt,
            deviceLimit,
            lteEnabled,
            syncStatus: "PENDING",
            syncVersion,
          },
        })
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: "ADMIN_EXTENDED",
        actorUserId: session.userId,
        previousStateJson: current ? JSON.stringify(current) : null,
        newStateJson: JSON.stringify(subscription),
        idempotencyKey: eventKey,
      },
    })
    await tx.outboxJob.create({
      data: {
        type: "PROVISION_SUBSCRIPTION",
        aggregateType: "Subscription",
        aggregateId: subscription.id,
        payloadJson: JSON.stringify({
          subscriptionId: subscription.id,
          syncVersion,
        }),
        dedupeKey: `subscription:${subscription.id}:sync:${syncVersion}`,
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "SUBSCRIPTION_EXTENDED",
        entityType: "Subscription",
        entityId: subscription.id,
        metadataJson: JSON.stringify({ days, deviceLimit, lteEnabled }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function retryProvisioning(formData: FormData) {
  const session = await admin()
  const id = String(formData.get("subscriptionId"))
  await db.$transaction(async (tx) => {
    const current = await tx.subscription.findUniqueOrThrow({ where: { id } })
    const syncVersion = current.syncVersion + 1
    await tx.subscription.update({
      where: { id },
      data: { syncVersion, syncStatus: "PENDING" },
    })
    await tx.outboxJob.create({
      data: {
        type: "PROVISION_SUBSCRIPTION",
        aggregateType: "Subscription",
        aggregateId: id,
        payloadJson: JSON.stringify({ subscriptionId: id, syncVersion }),
        dedupeKey: `subscription:${id}:sync:${syncVersion}`,
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "PROVISIONING_RETRIED",
        entityType: "Subscription",
        entityId: id,
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function regenerateSubscriptionUrl(formData: FormData) {
  const session = await admin()
  const id = String(formData.get("subscriptionId"))
  await db.$transaction(async (tx) => {
    const current = await tx.subscription.findUniqueOrThrow({ where: { id } })
    if (!current.remnawaveUserId)
      throw new Error("Subscription is not provisioned")
    const syncVersion = current.syncVersion + 1
    await tx.subscription.update({
      where: { id },
      data: { syncVersion, syncStatus: "PENDING" },
    })
    await tx.outboxJob.create({
      data: {
        type: "REGENERATE_SUBSCRIPTION_URL",
        aggregateType: "Subscription",
        aggregateId: id,
        payloadJson: JSON.stringify({ subscriptionId: id, syncVersion }),
        dedupeKey: `subscription:${id}:regenerate:${syncVersion}`,
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "SUBSCRIPTION_URL_REGENERATE_QUEUED",
        entityType: "Subscription",
        entityId: id,
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function adjustWallet(formData: FormData) {
  const session = await admin()
  const userId = String(formData.get("userId"))
  const deltaMinor = Math.round(Number(formData.get("deltaRub")) * 100)
  const reason = String(formData.get("reason") ?? "").trim()
  const adjustmentKey = String(formData.get("adjustmentKey") ?? "")
  if (
    !Number.isSafeInteger(deltaMinor) ||
    deltaMinor === 0 ||
    Math.abs(deltaMinor) > 100_000_000 ||
    reason.length < 5 ||
    reason.length > 500 ||
    adjustmentKey.length < 8 ||
    adjustmentKey.length > 200
  )
    throw new Error("Invalid wallet adjustment")
  await db.$transaction(async (tx) => {
    const idempotencyKey = `admin-wallet:${adjustmentKey}`
    const existing = await tx.walletLedgerEntry.findUnique({
      where: { idempotencyKey },
    })
    if (existing) {
      if (
        existing.userId !== userId ||
        existing.deltaAvailableMinor !== deltaMinor
      )
        throw new Error("Wallet adjustment idempotency conflict")
      return
    }
    const wallet = await tx.walletAccount.findUniqueOrThrow({
      where: { userId },
    })
    const changed = await tx.walletAccount.updateMany({
      where: {
        id: wallet.id,
        ...(deltaMinor < 0
          ? { availableMinor: { gte: Math.abs(deltaMinor) } }
          : {}),
      },
      data: {
        availableMinor: { increment: deltaMinor },
        version: { increment: 1 },
      },
    })
    if (!changed.count) throw new Error("Wallet balance would become negative")
    await tx.walletLedgerEntry.create({
      data: {
        walletAccountId: wallet.id,
        userId,
        type: "ADMIN_ADJUSTMENT",
        deltaAvailableMinor: deltaMinor,
        deltaReservedMinor: 0,
        referenceType: "AdminAdjustment",
        referenceId: adjustmentKey,
        idempotencyKey,
        description: reason,
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "WALLET_ADJUSTED",
        entityType: "WalletAccount",
        entityId: wallet.id,
        metadataJson: JSON.stringify({ userId, deltaMinor, reason }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function reconcilePayment(formData: FormData) {
  const session = await admin()
  const paymentId = String(formData.get("paymentId"))
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
    })
    if (payment.status !== "PENDING" || !payment.externalPaymentId)
      throw new Error("Only pending provider payments can be reconciled")
    const requestId = randomUUID()
    await tx.outboxJob.create({
      data: {
        type: "RECONCILE_PAYMENT",
        aggregateType: "Payment",
        aggregateId: payment.id,
        payloadJson: JSON.stringify({
          paymentId: payment.id,
          pollAttempt: 1,
          requestedByAdminId: session.userId,
        }),
        dedupeKey: `payment:${payment.id}:manual-reconcile:${requestId}`,
        maxAttempts: 8,
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "PAYMENT_RECONCILIATION_QUEUED",
        entityType: "Payment",
        entityId: payment.id,
        metadataJson: JSON.stringify({ requestId }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function abandonUncertainCheckout(formData: FormData) {
  const session = await admin()
  const paymentId = String(formData.get("paymentId"))
  const reason = String(formData.get("reason") ?? "").trim()
  if (reason.length < 10 || reason.length > 500)
    throw new Error("A verified provider-check reason is required")
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
    })
    if (payment.status !== "CREATED" || payment.externalPaymentId)
      throw new Error("Only an uncertain local checkout can be abandoned")
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "UNCERTAIN_CHECKOUT_ABANDONED",
        entityType: "Payment",
        entityId: payment.id,
        metadataJson: JSON.stringify({ reason }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function payoutAction(formData: FormData) {
  const session = await admin()
  const action = String(formData.get("action"))
  if (!["APPROVE", "REJECT", "PAID"].includes(action))
    throw new Error("Invalid payout action")
  await transitionPayout({
    payoutId: String(formData.get("payoutId")),
    adminUserId: session.userId,
    action: action as "APPROVE" | "REJECT" | "PAID",
    reason: String(formData.get("reason") ?? ""),
    correlationId: correlationId(),
  })
  revalidatePath("/admin")
}
export async function replySupport(formData: FormData) {
  const session = await admin()
  const conversationId = String(formData.get("conversationId"))
  const body = String(formData.get("body") ?? "").trim()
  if (body.length < 2 || body.length > 1000) return
  await db.$transaction(async (tx) => {
    await tx.supportMessage.create({
      data: {
        conversationId,
        authorRole: "ADMIN",
        senderUserId: session.userId,
        source: "ADMIN",
        body,
      },
    })
    await tx.supportConversation.update({
      where: { id: conversationId },
      data: { status: "OPEN", lastMessageAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "SUPPORT_REPLIED",
        entityType: "SupportConversation",
        entityId: conversationId,
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function setSupportStatus(formData: FormData) {
  const session = await admin()
  const id = String(formData.get("conversationId"))
  const status = String(formData.get("status")) === "CLOSED" ? "CLOSED" : "OPEN"
  await db.$transaction(async (tx) => {
    const previous = await tx.supportConversation.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    })
    await tx.supportConversation.update({ where: { id }, data: { status } })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: `SUPPORT_${status}`,
        entityType: "SupportConversation",
        entityId: id,
        metadataJson: JSON.stringify({ from: previous.status, to: status }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function retryJob(formData: FormData) {
  const session = await admin()
  const id = String(formData.get("jobId"))
  await db.$transaction(async (tx) => {
    const job = await tx.outboxJob.findUniqueOrThrow({ where: { id } })
    if (!["FAILED", "DEAD"].includes(job.status)) {
      throw new Error("Only failed or dead jobs can be retried")
    }
    await tx.outboxJob.update({
      where: { id },
      data: {
        status: "PENDING",
        attempts: 0,
        runAfter: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "JOB_RETRIED",
        entityType: "OutboxJob",
        entityId: id,
        metadataJson: JSON.stringify({
          previousStatus: job.status,
          previousAttempts: job.attempts,
        }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function updatePricing(formData: FormData) {
  const session = await admin()
  const values = {
    baseMonthlyPriceMinor: Math.round(Number(formData.get("base")) * 100),
    extraDeviceMonthlyPriceMinor: Math.round(
      Number(formData.get("extra")) * 100
    ),
    lteMonthlyPriceMinor: Math.round(Number(formData.get("lte")) * 100),
    referralRewardMinor: Math.round(Number(formData.get("reward")) * 100),
    referralTrialDays: Number(formData.get("trialDays")),
    minimalPayoutMinor: Math.round(Number(formData.get("payout")) * 100),
    minDeviceLimit: Number(formData.get("minDevices")),
    maxDeviceLimit: Number(formData.get("maxDevices")),
  }
  const durationDiscounts = {
    1: Number(formData.get("discount1")),
    3: Number(formData.get("discount3")),
    6: Number(formData.get("discount6")),
    12: Number(formData.get("discount12")),
  }
  if (
    Object.values(values).some(
      (value) => !Number.isSafeInteger(value) || value < 0
    ) ||
    Object.values(durationDiscounts).some(
      (value) => !Number.isSafeInteger(value) || value < 0 || value > 90
    ) ||
    values.referralTrialDays < 1 ||
    values.minDeviceLimit < 1 ||
    values.maxDeviceLimit > 5 ||
    values.minDeviceLimit > values.maxDeviceLimit
  )
    return
  await db.$transaction(async (tx) => {
    const previous = await tx.pricingSettings.findUniqueOrThrow({
      where: { key: "default" },
    })
    await tx.pricingSettings.update({
      where: { key: "default" },
      data: {
        ...values,
        durationDiscountsJson: JSON.stringify(durationDiscounts),
        version: { increment: 1 },
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "PRICING_UPDATED",
        entityType: "PricingSettings",
        entityId: "default",
        metadataJson: JSON.stringify({
          previousVersion: previous.version,
          nextVersion: previous.version + 1,
          values: { ...values, durationDiscounts },
        }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}

export async function resolveRefundReview(formData: FormData) {
  const session = await admin()
  const paymentId = String(formData.get("paymentId"))
  const decision = String(formData.get("decision"))
  if (!paymentId || !["SUSPEND", "KEEP_ACTIVE"].includes(decision)) {
    throw new Error("Invalid refund review decision")
  }

  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: {
        referralReward: true,
        subscriptionEvents: {
          where: { type: "REFUND_REVIEW_REQUIRED" },
          take: 1,
        },
      },
    })
    const needsReview =
      ["REFUNDED", "PARTIALLY_REFUNDED"].includes(payment.status) ||
      payment.referralReward?.status === "MANUAL_REVIEW"
    if (!needsReview || payment.subscriptionEvents.length === 0) {
      throw new Error("Payment does not have an open refund review")
    }

    const subscription = await tx.subscription.findUniqueOrThrow({
      where: { userId: payment.userId },
    })
    const resolutionKey = `payment:${payment.id}:refund-review-resolved`
    const existingResolution = await tx.subscriptionEvent.findUnique({
      where: { idempotencyKey: resolutionKey },
    })
    if (existingResolution) return

    let resolvedSubscription = subscription
    if (decision === "SUSPEND") {
      const syncVersion = subscription.syncVersion + 1
      resolvedSubscription = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "SUSPENDED",
          expiresAt: new Date(),
          nextDeviceLimit: null,
          nextLteEnabled: null,
          nextParametersAt: null,
          syncStatus: "PENDING",
          syncVersion,
        },
      })
      await tx.outboxJob.create({
        data: {
          type: "PROVISION_SUBSCRIPTION",
          aggregateType: "Subscription",
          aggregateId: subscription.id,
          payloadJson: JSON.stringify({
            subscriptionId: subscription.id,
            syncVersion,
          }),
          dedupeKey: `subscription:${subscription.id}:sync:${syncVersion}`,
        },
      })
    }

    const eventType =
      decision === "SUSPEND"
        ? "REFUND_REVIEW_SUSPENDED"
        : "REFUND_REVIEW_KEPT_ACTIVE"
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        paymentId: payment.id,
        actorUserId: session.userId,
        type: eventType,
        previousStateJson: JSON.stringify(subscription),
        newStateJson: JSON.stringify(resolvedSubscription),
        idempotencyKey: resolutionKey,
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: eventType,
        entityType: "Payment",
        entityId: payment.id,
        metadataJson: JSON.stringify({
          decision,
          paymentStatus: payment.status,
          referralRewardStatus: payment.referralReward?.status ?? null,
          subscriptionId: subscription.id,
        }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function resolveReferralRewardReview(formData: FormData) {
  const session = await admin()
  const paymentId = String(formData.get("paymentId"))
  const decision = String(formData.get("decision"))
  const reason = String(formData.get("reason") ?? "").trim()
  if (
    !["CLAWBACK", "WRITE_OFF"].includes(decision) ||
    reason.length < 5 ||
    reason.length > 500
  )
    throw new Error("Invalid reward review decision")
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { referralReward: true },
    })
    const reward = payment.referralReward
    if (!reward || reward.status !== "MANUAL_REVIEW")
      throw new Error("Referral reward is not awaiting review")
    if (decision === "CLAWBACK") {
      const wallet = await tx.walletAccount.findUniqueOrThrow({
        where: { userId: reward.inviterUserId },
      })
      const changed = await tx.walletAccount.updateMany({
        where: { id: wallet.id, availableMinor: { gte: reward.amountMinor } },
        data: {
          availableMinor: { decrement: reward.amountMinor },
          version: { increment: 1 },
        },
      })
      if (!changed.count)
        throw new Error("Insufficient available balance for clawback")
      await tx.walletLedgerEntry.create({
        data: {
          walletAccountId: wallet.id,
          userId: reward.inviterUserId,
          type: "REFERRAL_REWARD_REVERSAL",
          deltaAvailableMinor: -reward.amountMinor,
          deltaReservedMinor: 0,
          referenceType: "ReferralReward",
          referenceId: reward.id,
          idempotencyKey: `referral-reward:${reward.id}:admin-reversal`,
          description: reason,
        },
      })
      await tx.referralReward.update({
        where: { id: reward.id },
        data: { status: "REVERSED", reversedAt: new Date() },
      })
      await tx.referralInvite.update({
        where: { id: reward.inviteId },
        data: { status: "REWARD_REVERSED" },
      })
    } else {
      await tx.referralReward.update({
        where: { id: reward.id },
        data: { status: "PAID_OUT" },
      })
    }
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: `REFERRAL_REWARD_${decision}`,
        entityType: "ReferralReward",
        entityId: reward.id,
        metadataJson: JSON.stringify({ paymentId, reason }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function resolvePaymentFulfillmentReview(formData: FormData) {
  const session = await admin()
  const paymentId = String(formData.get("paymentId"))
  const decision = String(formData.get("decision"))
  const reason = String(formData.get("reason") ?? "").trim()
  if (
    !["EXTEND_STAGED_PLAN", "REFUND_REQUIRED"].includes(decision) ||
    reason.length < 10 ||
    reason.length > 500
  )
    throw new Error("Invalid fulfillment review decision")
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: {
        subscriptionEvents: {
          where: { type: "PAYMENT_FULFILLMENT_REVIEW_REQUIRED" },
          take: 1,
        },
      },
    })
    if (payment.status !== "CONFIRMED" || !payment.subscriptionEvents.length)
      throw new Error("Payment has no fulfillment review")
    const resolutionKey = `payment:${payment.id}:fulfillment-review-resolved`
    if (
      await tx.subscriptionEvent.findUnique({
        where: { idempotencyKey: resolutionKey },
      })
    )
      return
    const subscription = await tx.subscription.findUniqueOrThrow({
      where: { userId: payment.userId },
    })
    let resolved = subscription
    if (decision === "EXTEND_STAGED_PLAN") {
      const syncVersion = subscription.syncVersion + 1
      resolved = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          expiresAt: new Date(
            Math.max(Date.now(), subscription.expiresAt.getTime()) +
              payment.durationDays * 86_400_000
          ),
          syncStatus: "PENDING",
          syncVersion,
        },
      })
      await tx.outboxJob.create({
        data: {
          type: "PROVISION_SUBSCRIPTION",
          aggregateType: "Subscription",
          aggregateId: subscription.id,
          payloadJson: JSON.stringify({
            subscriptionId: subscription.id,
            syncVersion,
          }),
          dedupeKey: `subscription:${subscription.id}:sync:${syncVersion}`,
        },
      })
    }
    const eventType =
      decision === "EXTEND_STAGED_PLAN"
        ? "PAYMENT_FULFILLMENT_RESOLVED_STAGED_PLAN"
        : "PAYMENT_FULFILLMENT_REFUND_REQUIRED"
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        paymentId: payment.id,
        actorUserId: session.userId,
        type: eventType,
        previousStateJson: JSON.stringify(subscription),
        newStateJson: JSON.stringify(resolved),
        idempotencyKey: resolutionKey,
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: eventType,
        entityType: "Payment",
        entityId: payment.id,
        metadataJson: JSON.stringify({ reason }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
export async function createBroadcastDraft(formData: FormData) {
  const session = await admin()
  const title = String(formData.get("title") ?? "").trim()
  const body = String(formData.get("body") ?? "").trim()
  const target =
    String(formData.get("target")) === "ALL_REACHABLE"
      ? "ALL_REACHABLE"
      : "NEWS_OPTED_IN"
  const requestKey = String(formData.get("requestKey") ?? "")
  if (
    title.length < 2 ||
    body.length < 2 ||
    body.length > 3500 ||
    requestKey.length < 8 ||
    requestKey.length > 200
  )
    return
  await db.$transaction(async (tx) => {
    const stateKey = `admin-broadcast-request:${requestKey}`
    if (await tx.systemState.findUnique({ where: { key: stateKey } })) return
    await tx.systemState.create({
      data: {
        key: stateKey,
        valueJson: JSON.stringify({ createdAt: new Date() }),
      },
    })
    const broadcast = await tx.telegramBroadcast.create({
      data: {
        createdByAdminId: session.userId,
        title,
        body,
        target,
        status: "DRAFT",
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "BROADCAST_DRAFT_CREATED",
        entityType: "TelegramBroadcast",
        entityId: broadcast.id,
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}

export async function queueBroadcastDraft(formData: FormData) {
  const session = await admin()
  const broadcastId = String(formData.get("broadcastId"))
  await db.$transaction(async (tx) => {
    const broadcast = await tx.telegramBroadcast.findUniqueOrThrow({
      where: { id: broadcastId },
    })
    if (broadcast.status === "QUEUED") return
    if (broadcast.status !== "DRAFT")
      throw new Error("Only a draft can be queued")
    const changed = await tx.telegramBroadcast.updateMany({
      where: { id: broadcast.id, status: "DRAFT" },
      data: { status: "QUEUED", queuedAt: new Date() },
    })
    if (!changed.count) return
    const profiles = await tx.telegramProfile.findMany({
      where: {
        canReceiveMessages: true,
        chatId: { not: null },
        ...(broadcast.target === "NEWS_OPTED_IN"
          ? { newsNotificationsEnabled: true }
          : {}),
      },
      select: { userId: true },
    })
    if (profiles.length)
      await tx.telegramBroadcastDelivery.createMany({
        data: profiles.map((profile) => ({
          broadcastId: broadcast.id,
          userId: profile.userId,
        })),
      })
    await tx.outboxJob.upsert({
      where: { dedupeKey: `broadcast:${broadcast.id}:batch:0` },
      create: {
        type: "SEND_TELEGRAM_BROADCAST_BATCH",
        aggregateType: "TelegramBroadcast",
        aggregateId: broadcast.id,
        payloadJson: JSON.stringify({ broadcastId: broadcast.id, batch: 0 }),
        dedupeKey: `broadcast:${broadcast.id}:batch:0`,
      },
      update: {},
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "BROADCAST_QUEUED",
        entityType: "TelegramBroadcast",
        entityId: broadcast.id,
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}

export async function cancelBroadcast(formData: FormData) {
  const session = await admin()
  const broadcastId = String(formData.get("broadcastId"))
  await db.$transaction(async (tx) => {
    const changed = await tx.telegramBroadcast.updateMany({
      where: { id: broadcastId, status: { in: ["DRAFT", "QUEUED"] } },
      data: { status: "CANCELED" },
    })
    if (!changed.count) throw new Error("Broadcast has already started")
    await tx.telegramBroadcastDelivery.updateMany({
      where: { broadcastId, status: "PENDING" },
      data: { status: "SKIPPED" },
    })
    await tx.outboxJob.updateMany({
      where: {
        type: "SEND_TELEGRAM_BROADCAST_BATCH",
        aggregateId: broadcastId,
        status: { in: ["PENDING", "FAILED"] },
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        lastError: "Canceled by administrator before sending",
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "BROADCAST_CANCELED",
        entityType: "TelegramBroadcast",
        entityId: broadcastId,
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin")
}
