import type { Subscription } from "@/generated/prisma/client"
import { SubscriptionStatus } from "@/generated/prisma/client"

export function getEffectiveSubscriptionStatus(
  subscription: Subscription | null | undefined
) {
  if (!subscription) {
    return SubscriptionStatus.NONE
  }

  if (
    subscription.expiresAt &&
    subscription.expiresAt <= new Date() &&
    subscription.status === SubscriptionStatus.ACTIVE
  ) {
    return SubscriptionStatus.EXPIRED
  }

  return subscription.status
}

export function getSubscriptionStatusLabel(status: SubscriptionStatus) {
  switch (status) {
    case SubscriptionStatus.ACTIVE:
    case SubscriptionStatus.TRIAL:
      return "Активна"
    case SubscriptionStatus.EXPIRED:
      return "Закончилась"
    case SubscriptionStatus.CANCELED:
      return "Отменена"
    case SubscriptionStatus.NONE:
    default:
      return "Нет подписки"
  }
}

export function getSubscriptionCta(status: SubscriptionStatus) {
  switch (status) {
    case SubscriptionStatus.ACTIVE:
    case SubscriptionStatus.TRIAL:
      return "Настроить VPN"
    case SubscriptionStatus.EXPIRED:
    case SubscriptionStatus.CANCELED:
      return "Продлить подписку"
    case SubscriptionStatus.NONE:
    default:
      return "Оплатить подписку"
  }
}
