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
    referralFriendDiscountPct: 0,
    referralRewardDays: settings.referralRewardDays,
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

/**
 * Оплата может быть точечно отключена у отдельного аккаунта (демо-доступ для
 * партнёров). Флаг нужен UI, чтобы не показывать кнопку, которая всё равно
 * упрётся в отказ на сервере; сам запрет живёт в billing/service.
 */
export async function isBillingDisabledForUser(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { billingDisabled: true },
  })
  return user?.billingDisabled ?? false
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

export async function hasUnreadSupportReply(userId: string) {
  const conversation = await db.supportConversation.findUnique({
    where: { userId },
    select: {
      userLastReadAt: true,
      messages: {
        where: { authorRole: "ADMIN", isInternal: false },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { createdAt: true },
      },
    },
  })
  const latestReplyAt = conversation?.messages[0]?.createdAt
  if (!latestReplyAt) return false
  return (
    !conversation.userLastReadAt || latestReplyAt > conversation.userLastReadAt
  )
}

export async function getReferralsView(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      referralProfile: true,
      sentInvites: {
        include: {
          invited: { include: { identities: true } },
          subscriptionReward: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
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
  const [profile, invitedUsers, activeUsers, rewards] = await Promise.all([
    db.referralProfile.findUnique({ where: { userId } }),
    db.referralInvite.count({ where: { inviterUserId: userId } }),
    db.referralInvite.count({
      where: {
        inviterUserId: userId,
        status: "PAID",
      },
    }),
    db.referralSubscriptionReward.aggregate({
      where: { inviterUserId: userId },
      _sum: { days: true },
    }),
  ])

  const inviteCode =
    profile?.isEnabled && profile.inviteCode ? profile.inviteCode : null
  const botUsername = getConfig().telegram.botUsername
  return {
    inviteUrl: inviteCode
      ? `${getConfig().appUrl}/?invite=${inviteCode}`
      : null,
    telegramInviteUrl:
      inviteCode && botUsername
        ? `https://t.me/${botUsername}?start=ref_${inviteCode}`
        : null,
    invitedUsers,
    activeUsers,
    rewardDays: rewards._sum.days ?? 0,
  }
}
