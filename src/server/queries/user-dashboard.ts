import { db } from "@/src/server/infrastructure/db/client"
import { getConfig } from "@/src/server/config"
import type {
  PreviewPricing,
  PreviewSubscription,
} from "@/src/frontend-preview/view-models"
import { availableDurationMonths } from "@/src/server/domain/billing/pricing"

export async function getPricingView(userId: string): Promise<PreviewPricing> {
  void userId
  const settings = await db.pricingSettings.findUniqueOrThrow({
    where: { key: "default" },
  })
  const discounts = JSON.parse(settings.durationDiscountsJson) as Record<
    string,
    number
  >
  const durationOptions = availableDurationMonths(settings).map((months) => {
    const discountPct = discounts[String(months)] ?? 0
    return {
      months,
      discountPct,
      totalRub:
        Math.round(
          (settings.baseMonthlyPriceMinor * months * (100 - discountPct)) / 100
        ) / 100,
    }
  })
  return {
    baseMonthlyPriceRub: settings.baseMonthlyPriceMinor / 100,
    pricingVersion: settings.version,
    durationOptions,
    extraDeviceMonthlyPriceRub: settings.extraDeviceMonthlyPriceMinor / 100,
    deviceLimitUpgradePriceRub: settings.deviceLimitUpgradePriceMinor / 100,
    lteMonthlyPriceRub: settings.lteMonthlyPriceMinor / 100,
    minDeviceLimit: settings.minDeviceLimit,
    maxDeviceLimit: settings.maxDeviceLimit,
    minimalPayoutRub: settings.minimalPayoutMinor / 100,
    referralFriendDiscountPct: 0,
    referralRewardRub: settings.referralRewardMinor / 100,
    referralTrialDays: settings.referralTrialDays,
  }
}

export async function getSubscriptionView(
  userId: string
): Promise<PreviewSubscription | null> {
  const item = await db.subscription.findUnique({ where: { userId } })
  if (!item) return null
  const effectiveStatus =
    item.expiresAt <= new Date()
      ? "EXPIRED"
      : item.status === "SUSPENDED"
        ? "CANCELED"
        : item.status
  return {
    id: item.id,
    createdAt: item.createdAt,
    startsAt: item.startedAt,
    expiresAt: item.expiresAt,
    deviceLimit: item.deviceLimit,
    lteEnabled: item.lteEnabled,
    nextDeviceLimit: item.nextDeviceLimit,
    nextLteEnabled: item.nextLteEnabled,
    nextParametersAt: item.nextParametersAt,
    subscriptionUrl: item.subscriptionUrl,
    status: effectiveStatus,
    syncStatus: item.syncStatus,
    lastUserFriendlyError: item.lastUserFriendlyError,
    lastTechnicalError: null,
  }
}

export async function getWalletBalanceView(userId: string) {
  const wallet = await db.walletAccount.findUnique({
    where: { userId },
    select: { availableMinor: true },
  })

  return (wallet?.availableMinor ?? 0) / 100
}

export async function getLastPurchasePreferencesView(userId: string) {
  return db.payment.findFirst({
    where: { userId, status: "CONFIRMED" },
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
    select: { deviceLimit: true, lteEnabled: true },
  })
}

export async function getProfileView(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      identities: true,
    },
  })
}

export async function getSupportMessagesView(userId: string) {
  const conversation = await db.supportConversation.findUnique({
    where: { userId },
    select: {
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: "desc" },
        take: 200,
      },
    },
  })

  return conversation?.messages ?? []
}

export async function getReferralsView(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      wallet: true,
      referralProfile: true,
      sentInvites: {
        include: { invited: { include: { identities: true } }, reward: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      payouts: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  })
  return {
    user,
    inviteUrl: user.referralProfile?.isEnabled
      ? `${getConfig().appUrl}/?invite=${user.referralProfile.inviteCode}`
      : null,
  }
}

export async function getReferralSummaryView(userId: string) {
  const now = new Date()
  const [profile, invitedUsers, activeUsers, rewards, wallet] =
    await Promise.all([
      db.referralProfile.findUnique({ where: { userId } }),
      db.referralInvite.count({ where: { inviterUserId: userId } }),
      db.referralInvite.count({
        where: {
          inviterUserId: userId,
          invited: {
            subscription: {
              is: {
                status: { in: ["ACTIVE", "TRIAL"] },
                expiresAt: { gt: now },
              },
            },
          },
        },
      }),
      db.referralReward.aggregate({
        where: { inviterUserId: userId, status: { not: "REVERSED" } },
        _sum: { amountMinor: true },
      }),
      db.walletAccount.findUnique({
        where: { userId },
        select: { availableMinor: true },
      }),
    ])

  return {
    inviteUrl:
      profile?.isEnabled && profile.inviteCode
        ? `${getConfig().appUrl}/?invite=${profile.inviteCode}`
        : null,
    invitedUsers,
    activeUsers,
    rewardMinor: rewards._sum.amountMinor ?? 0,
    availableMinor: wallet?.availableMinor ?? 0,
  }
}
