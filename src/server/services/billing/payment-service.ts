import {
  JobType,
  PaymentStatus,
  ReferralInviteStatus,
  ReferralRewardStatus,
  SubscriptionStatus,
  WalletLedgerDirection,
  WalletLedgerStatus,
  WalletLedgerType,
  type Payment,
  type Prisma,
} from "@/generated/prisma/client"

import {
  ConflictError,
  IntegrationError,
  NotFoundError,
  ValidationError,
} from "@/lib/application-errors"
import { prisma } from "@/lib/db"
import {
  calculateSubscriptionPrice,
  getDurationDiscounts,
} from "@/lib/pricing"
import { getActivePricingVersion } from "@/lib/pricing-data"
import { runInTransaction } from "@/lib/transactions"
import { getConfiguredPaymentProvider } from "@/src/server/services/payments/provider"

const QUOTE_TTL_MS = 15 * 60 * 1000

export type CreateSubscriptionPaymentInput = {
  userId: string
  months: number
  deviceLimit: number
  lteEnabled: boolean
  idempotencyKey: string
}

export async function createSubscriptionPayment(
  input: CreateSubscriptionPaymentInput
) {
  const paymentIdempotencyKey = `payment:${input.idempotencyKey}`
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey: paymentIdempotencyKey },
  })

  if (existing) {
    assertSamePaymentRequest(existing, input)

    if (existing.status !== PaymentStatus.CREATED) {
      return existing
    }
  }

  const provider = getConfiguredPaymentProvider()
  const payment = existing ?? (await createQuoteAndPayment(input, provider.type))
  const quote = await prisma.priceQuote.findUniqueOrThrow({
    where: { id: payment.quoteId },
  })

  if (payment.status === PaymentStatus.CREATED && quote.expiresAt <= new Date()) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.CREATED },
      data: { status: PaymentStatus.CANCELED, canceledAt: new Date() },
    })
    throw new ConflictError("Price quote expired before checkout was created.", {
      quoteId: quote.id,
    })
  }

  try {
    // Provider I/O is outside SQL transactions and receives its own stable key.
    const created = await provider.createPayment({
      paymentId: payment.id,
      amountRub: payment.amountRub,
      currency: "RUB",
      description: `PulsarVPN ${payment.durationMonths} мес.`,
      idempotencyKey: payment.idempotencyKey,
    })
    await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.CREATED },
      data: {
        status: PaymentStatus.PENDING,
        externalPaymentId: created.providerPaymentId,
        checkoutUrl: created.checkoutUrl,
      },
    })

    return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })
  } catch (error) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.CREATED },
      data: { status: PaymentStatus.FAILED, failedAt: new Date() },
    })
    throw new IntegrationError(
      "Payment provider rejected payment creation.",
      { paymentId: payment.id },
      { cause: error }
    )
  }
}

async function createQuoteAndPayment(
  input: CreateSubscriptionPaymentInput,
  provider: Payment["provider"]
) {
  return runInTransaction(prisma, async (tx) => {
    const paymentIdempotencyKey = `payment:${input.idempotencyKey}`
    const existing = await tx.payment.findUnique({
      where: { idempotencyKey: paymentIdempotencyKey },
    })

    if (existing) {
      assertSamePaymentRequest(existing, input)
      return existing
    }

    const pricing = await getActivePricingVersion(tx)
    const duration = getDurationDiscounts(pricing).find(
      (option) => option.months === input.months
    )

    if (!duration) {
      throw new ValidationError("Selected subscription duration is unavailable.", {
        months: input.months,
      })
    }

    if (
      input.deviceLimit < pricing.minDeviceLimit ||
      input.deviceLimit > pricing.maxDeviceLimit
    ) {
      throw new ValidationError("Selected device limit is unavailable.", {
        deviceLimit: input.deviceLimit,
      })
    }

    const referralInvite = await tx.referralInvite.findUnique({
      where: { invitedUserId: input.userId },
    })
    const referralDiscountPct =
      referralInvite?.status === ReferralInviteStatus.REGISTERED
        ? pricing.referralFriendDiscountPct
        : 0
    const price = calculateSubscriptionPrice(pricing, {
      months: input.months,
      deviceLimit: input.deviceLimit,
      lteEnabled: input.lteEnabled,
      referralDiscountPct,
    })

    if (price.totalRub <= 0) {
      throw new ValidationError("Payment total must be positive.")
    }

    const quote = await tx.priceQuote.create({
      data: {
        userId: input.userId,
        pricingVersionId: pricing.id,
        durationMonths: input.months,
        deviceLimit: input.deviceLimit,
        lteEnabled: input.lteEnabled,
        referralDiscountPct,
        subtotalRub: price.subtotalRub,
        discountRub: price.discountRub,
        totalRub: price.totalRub,
        pricingSnapshot: {
          pricingVersionId: pricing.id,
          pricingVersion: pricing.version,
          currency: pricing.currency,
          baseMonthlyPriceRub: pricing.baseMonthlyPriceRub,
          extraDeviceMonthlyPriceRub: pricing.extraDeviceMonthlyPriceRub,
          lteMonthlyPriceRub: pricing.lteMonthlyPriceRub,
          durationDiscounts:
            pricing.durationDiscounts as Prisma.InputJsonValue,
          durationDiscountPct: price.durationDiscountPct,
          referralDiscountPct,
        },
        idempotencyKey: `quote:${input.idempotencyKey}`,
        expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
      },
    })

    return tx.payment.create({
      data: {
        userId: input.userId,
        quoteId: quote.id,
        provider,
        status: PaymentStatus.CREATED,
        amountRub: quote.totalRub,
        durationMonths: quote.durationMonths,
        deviceLimit: quote.deviceLimit,
        lteEnabled: quote.lteEnabled,
        idempotencyKey: paymentIdempotencyKey,
      },
    })
  })
}

export function confirmMockPayment(paymentId: string, adminUserId: string) {
  return runInTransaction(prisma, (tx) =>
    confirmPaymentInTransaction(tx, paymentId, {
      actorUserId: adminUserId,
      source: "admin.mock",
    })
  )
}

export async function confirmPaymentInTransaction(
  tx: Prisma.TransactionClient,
  paymentId: string,
  context: {
    actorUserId?: string
    source: string
    providerEventId?: string
  }
) {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { quote: true },
  })

  if (!payment) {
    throw new NotFoundError("Payment not found.", { paymentId })
  }

  if (context.source === "admin.mock" && payment.provider !== "MOCK") {
    throw new ConflictError("Only mock payments can be confirmed manually.", {
      paymentId,
      provider: payment.provider,
    })
  }

  if (payment.status === PaymentStatus.SUCCEEDED) {
    return { payment, applied: false }
  }

  if (payment.amountRub !== payment.quote.totalRub) {
    throw new ConflictError("Payment amount no longer matches its quote.", {
      paymentId,
    })
  }

  const succeeded = await tx.payment.updateMany({
    where: {
      id: payment.id,
      status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] },
    },
    data: { status: PaymentStatus.SUCCEEDED, confirmedAt: new Date() },
  })

  if (succeeded.count !== 1) {
    throw new ConflictError("Payment cannot succeed from its current state.", {
      paymentId,
      status: payment.status,
    })
  }

  const now = new Date()
  const currentSubscription = await tx.subscription.findUnique({
    where: { userId: payment.userId },
  })
  const periodStartsAt =
    currentSubscription?.expiresAt && currentSubscription.expiresAt > now
      ? currentSubscription.expiresAt
      : now
  const periodEndsAt = addMonths(periodStartsAt, payment.durationMonths)

  const subscription = currentSubscription
    ? await tx.subscription.update({
        where: { id: currentSubscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          startsAt: currentSubscription.startsAt ?? now,
          expiresAt: periodEndsAt,
          deviceLimit: payment.deviceLimit,
          lteEnabled: payment.lteEnabled,
          syncStatus: "PENDING",
          version: { increment: 1 },
        },
      })
    : await tx.subscription.create({
        data: {
          userId: payment.userId,
          status: SubscriptionStatus.ACTIVE,
          startsAt: now,
          expiresAt: periodEndsAt,
          deviceLimit: payment.deviceLimit,
          lteEnabled: payment.lteEnabled,
          syncStatus: "PENDING",
        },
      })

  await tx.subscriptionPeriod.create({
    data: {
      subscriptionId: subscription.id,
      paymentId: payment.id,
      startsAt: periodStartsAt,
      endsAt: periodEndsAt,
      deviceLimit: payment.deviceLimit,
      lteEnabled: payment.lteEnabled,
      amountRub: payment.amountRub,
    },
  })
  await tx.priceQuote.update({
    where: { id: payment.quoteId },
    data: { consumedAt: now },
  })

  await createPaymentLedgerEntries(tx, payment, now)
  await ensureReferralReward(
    tx,
    payment.userId,
    payment.id,
    payment.quote.pricingVersionId
  )
  await tx.job.create({
    data: {
      type: JobType.PROVISION_SUBSCRIPTION,
      idempotencyKey: `subscription:${subscription.id}:payment:${payment.id}`,
      payload: { subscriptionId: subscription.id, paymentId: payment.id },
    },
  })
  await tx.job.create({
    data: {
      type: JobType.SEND_PAYMENT_RECEIPT,
      idempotencyKey: `payment:${payment.id}:receipt`,
      payload: { paymentId: payment.id, userId: payment.userId },
    },
  })
  await tx.auditEvent.create({
    data: {
      actorUserId: context.actorUserId,
      eventType: "payment.succeeded",
      entityType: "Payment",
      entityId: payment.id,
      idempotencyKey: `audit:payment:${payment.id}:succeeded`,
      data: {
        amountRub: payment.amountRub,
        source: context.source,
        providerEventId: context.providerEventId,
      },
    },
  })

  return {
    payment: await tx.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    applied: true,
  }
}

async function createPaymentLedgerEntries(
  tx: Prisma.TransactionClient,
  payment: Payment,
  postedAt: Date
) {
  await tx.walletLedgerEntry.create({
    data: {
      userId: payment.userId,
      paymentId: payment.id,
      direction: WalletLedgerDirection.CREDIT,
      amountRub: payment.amountRub,
      type: WalletLedgerType.PAYMENT_CAPTURE,
      status: WalletLedgerStatus.POSTED,
      postedAt,
      idempotencyKey: `payment:${payment.id}:capture`,
    },
  })
  await tx.walletLedgerEntry.create({
    data: {
      userId: payment.userId,
      paymentId: payment.id,
      direction: WalletLedgerDirection.DEBIT,
      amountRub: payment.amountRub,
      type: WalletLedgerType.SUBSCRIPTION_CHARGE,
      status: WalletLedgerStatus.POSTED,
      postedAt,
      idempotencyKey: `payment:${payment.id}:subscription`,
    },
  })
}

async function ensureReferralReward(
  tx: Prisma.TransactionClient,
  invitedUserId: string,
  paymentId: string,
  pricingVersionId: string
) {
  const invite = await tx.referralInvite.findUnique({
    where: { invitedUserId },
  })

  if (!invite || invite.status !== ReferralInviteStatus.REGISTERED) {
    return
  }

  const converted = await tx.referralInvite.updateMany({
    where: { id: invite.id, status: ReferralInviteStatus.REGISTERED },
    data: { status: ReferralInviteStatus.CONVERTED, convertedAt: new Date() },
  })

  if (converted.count !== 1) {
    return
  }

  const pricing = await tx.pricingVersion.findUniqueOrThrow({
    where: { id: pricingVersionId },
  })
  await tx.referralProfile.update({
    where: { userId: invitedUserId },
    data: { isEnabled: true, enabledAt: new Date() },
  })

  if (pricing.referralRewardRub <= 0) {
    return
  }

  const reward = await tx.referralReward.create({
    data: {
      inviteId: invite.id,
      inviterId: invite.inviterId,
      invitedUserId,
      paymentId,
      amountRub: pricing.referralRewardRub,
      status: ReferralRewardStatus.AVAILABLE,
      availableAt: new Date(),
    },
  })
  await tx.walletLedgerEntry.create({
    data: {
      userId: invite.inviterId,
      referralRewardId: reward.id,
      direction: WalletLedgerDirection.CREDIT,
      amountRub: pricing.referralRewardRub,
      type: WalletLedgerType.REFERRAL_REWARD,
      status: WalletLedgerStatus.POSTED,
      postedAt: new Date(),
      idempotencyKey: `referral:${invite.id}:reward`,
    },
  })
  await tx.user.update({
    where: { id: invite.inviterId },
    data: { balanceRub: { increment: pricing.referralRewardRub } },
  })
}

function assertSamePaymentRequest(
  payment: Payment,
  input: CreateSubscriptionPaymentInput
) {
  if (
    payment.userId !== input.userId ||
    payment.durationMonths !== input.months ||
    payment.deviceLimit !== input.deviceLimit ||
    payment.lteEnabled !== input.lteEnabled
  ) {
    throw new ConflictError("Payment idempotency key was reused with new input.")
  }
}

function addMonths(date: Date, months: number) {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}
