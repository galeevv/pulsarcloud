import {
  AuthIdentityType,
  IntegrationLogStatus,
  IntegrationProvider,
  PaymentProviderType,
  PaymentStatus,
  ReferralInviteStatus,
  ReferralRewardStatus,
  SubscriptionFeatureType,
  SubscriptionStatus,
  WalletLedgerDirection,
  WalletLedgerStatus,
  WalletLedgerType,
} from "@prisma/client"

import { prisma } from "@/lib/db"
import { calculateSubscriptionPriceRub } from "@/lib/pricing"
import { createPaymentProvider } from "@/src/server/services/payments/provider"
import { createSubscriptionProvisioningService } from "@/src/server/services/provisioning/subscription-provisioning-service"

type CreateMockPaymentInput = {
  userId: string
  months: number
  deviceLimit: number
  lteEnabled: boolean
}

export async function createMockPayment(input: CreateMockPaymentInput) {
  const settings = await prisma.pricingSettings.findUniqueOrThrow({
    where: { id: "default" },
  })
  const amountRub = calculateSubscriptionPriceRub(settings, input)
  const payment = await prisma.payment.create({
    data: {
      userId: input.userId,
      provider: PaymentProviderType.MOCK,
      status: PaymentStatus.PENDING,
      amountRub,
      durationMonths: input.months,
      deviceLimit: input.deviceLimit,
      lteEnabled: input.lteEnabled,
    },
  })
  const provider = createPaymentProvider()
  const createdPayment = await provider.createPayment({
    paymentId: payment.id,
    amountRub,
    description: `PulsarVPN ${input.months} мес.`,
  })

  return prisma.payment.update({
    where: { id: payment.id },
    data: {
      externalPaymentId: createdPayment.providerPaymentId,
      checkoutUrl: createdPayment.checkoutUrl,
    },
  })
}

export async function confirmMockPayment(paymentId: string, adminUserId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: true,
    },
  })

  if (!payment) {
    throw new Error("Payment not found")
  }

  if (payment.status === PaymentStatus.CONFIRMED) {
    return payment
  }

  const startsAt = new Date()
  const existingSubscription = await prisma.subscription.findFirst({
    where: {
      userId: payment.userId,
      status: {
        in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED],
      },
    },
    orderBy: { createdAt: "desc" },
  })
  const baseDate =
    existingSubscription?.expiresAt && existingSubscription.expiresAt > startsAt
      ? existingSubscription.expiresAt
      : startsAt
  const expiresAt = new Date(baseDate)
  expiresAt.setMonth(expiresAt.getMonth() + payment.durationMonths)

  const subscription = existingSubscription
    ? await prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          startsAt: existingSubscription.startsAt ?? startsAt,
          expiresAt,
          deviceLimit: payment.deviceLimit,
          lteEnabled: payment.lteEnabled,
          features: {
            upsert: {
              where: {
                subscriptionId_type: {
                  subscriptionId: existingSubscription.id,
                  type: SubscriptionFeatureType.REGULAR_ACCESS,
                },
              },
              update: { enabled: true },
              create: {
                type: SubscriptionFeatureType.REGULAR_ACCESS,
                label: "Основные VPN-профили",
              },
            },
          },
        },
      })
    : await prisma.subscription.create({
        data: {
          userId: payment.userId,
          status: SubscriptionStatus.ACTIVE,
          startsAt,
          expiresAt,
          deviceLimit: payment.deviceLimit,
          lteEnabled: payment.lteEnabled,
          features: {
            create: {
              type: SubscriptionFeatureType.REGULAR_ACCESS,
              label: "Основные VPN-профили",
            },
          },
        },
      })

  if (payment.lteEnabled) {
    await prisma.subscriptionFeature.upsert({
      where: {
        subscriptionId_type: {
          subscriptionId: subscription.id,
          type: SubscriptionFeatureType.LTE_ACCESS,
        },
      },
      update: { enabled: true },
      create: {
        subscriptionId: subscription.id,
        type: SubscriptionFeatureType.LTE_ACCESS,
        label: "LTE add-on",
        enabled: true,
      },
    })
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.CONFIRMED,
      confirmedAt: new Date(),
    },
  })

  await prisma.walletLedgerEntry.createMany({
    data: [
      {
        userId: payment.userId,
        direction: WalletLedgerDirection.CREDIT,
        amountRub: payment.amountRub,
        type: WalletLedgerType.TOPUP,
        status: WalletLedgerStatus.POSTED,
        idempotencyKey: `payment:${payment.id}:topup`,
      },
      {
        userId: payment.userId,
        direction: WalletLedgerDirection.DEBIT,
        amountRub: payment.amountRub,
        type: WalletLedgerType.SUBSCRIPTION_PAYMENT,
        status: WalletLedgerStatus.POSTED,
        idempotencyKey: `payment:${payment.id}:subscription`,
      },
    ],
    skipDuplicates: true,
  })

  await ensureReferralReward(payment.userId, payment.id)
  await createSubscriptionProvisioningService().provisionSubscription(
    subscription.id
  )

  await prisma.auditLog.create({
    data: {
      actorUserId: adminUserId,
      action: "payment.confirm",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { amountRub: payment.amountRub },
    },
  })

  await prisma.integrationLog.create({
    data: {
      provider: IntegrationProvider.PLATEGA,
      action: "mock.confirmPayment",
      status: IntegrationLogStatus.SUCCESS,
      requestPayload: { paymentId: payment.id },
      responsePayload: { confirmed: true },
    },
  })

  return payment
}

async function ensureReferralReward(invitedUserId: string, paymentId: string) {
  const invite = await prisma.referralInvite.findUnique({
    where: { invitedUserId },
  })

  if (!invite || invite.status === ReferralInviteStatus.PAID) {
    return
  }

  const settings = await prisma.pricingSettings.findUniqueOrThrow({
    where: { id: "default" },
  })

  await prisma.referralInvite.update({
    where: { id: invite.id },
    data: {
      status: ReferralInviteStatus.PAID,
      convertedAt: new Date(),
    },
  })

  await prisma.referralReward.create({
    data: {
      inviterId: invite.inviterId,
      invitedUserId,
      paymentId,
      amountRub: settings.referralRewardRub,
      status: ReferralRewardStatus.AVAILABLE,
      availableAt: new Date(),
    },
  })

  await prisma.walletLedgerEntry.create({
    data: {
      userId: invite.inviterId,
      direction: WalletLedgerDirection.CREDIT,
      amountRub: settings.referralRewardRub,
      type: WalletLedgerType.REFERRAL_REWARD,
      status: WalletLedgerStatus.POSTED,
      idempotencyKey: `referral:${paymentId}`,
    },
  })

  await prisma.user.update({
    where: { id: invite.inviterId },
    data: {
      balanceRub: {
        increment: settings.referralRewardRub,
      },
    },
  })

  await prisma.referralProfile.upsert({
    where: { userId: invitedUserId },
    update: {
      isEnabled: true,
      enabledAt: new Date(),
    },
    create: {
      userId: invitedUserId,
      inviteCode: invitedUserId.slice(-7),
      inviteUrl: `https://pulsarr.space/?invite=${invitedUserId.slice(-7)}`,
      isEnabled: true,
      enabledAt: new Date(),
    },
  })

  await prisma.authIdentity.findFirst({
    where: {
      userId: invitedUserId,
      type: AuthIdentityType.EMAIL,
    },
  })
}
