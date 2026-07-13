import { db } from "@/src/server/infrastructure/db/client"
import { getConfig } from "@/src/server/config"
import type {
  PreviewPricing,
  PreviewSubscription,
} from "@/src/frontend-preview/view-models"

export async function getPricingView(): Promise<PreviewPricing> {
  const settings = await db.pricingSettings.findUniqueOrThrow({
    where: { key: "default" },
  })
  const discounts = JSON.parse(settings.durationDiscountsJson) as Record<
    string,
    number
  >
  const durationOptions = [1, 3, 6, 12].map((months) => {
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
    durationOptions,
    extraDeviceMonthlyPriceRub: settings.extraDeviceMonthlyPriceMinor / 100,
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

export async function getUserView(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      identities: true,
      wallet: true,
      referralProfile: true,
      telegramProfile: true,
      sentInvites: {
        include: { invited: { include: { identities: true } }, reward: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      payouts: { orderBy: { createdAt: "desc" }, take: 50 },
      supportConversation: {
        include: { messages: { orderBy: { createdAt: "desc" }, take: 200 } },
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
