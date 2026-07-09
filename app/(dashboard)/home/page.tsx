import Image from "next/image"
import Link from "next/link"
import { ChevronRightIcon, GiftIcon } from "lucide-react"

import { SetupVpnAction } from "@/components/app/setup-vpn-action"
import { SubscriptionPaymentAction } from "@/components/app/subscription-payment-action"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  getEffectiveSubscriptionStatus,
  getSubscriptionStatusLabel,
} from "@/lib/subscription"
import { SubscriptionStatus, type Subscription } from "@prisma/client"

export default async function HomePage() {
  const user = await requireUser()
  const [subscription, settings] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pricingSettings.findUniqueOrThrow({ where: { id: "default" } }),
  ])
  const status = getEffectiveSubscriptionStatus(subscription)
  const renewalLabel =
    status === "NONE" ? "Оплатить подписку" : "Продлить подписку"
  const subscriptionSummary = getHomeSubscriptionSummary(subscription, status)

  return (
    <main className="pulsar-container">
      <Card className="gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0">
        <div className="relative aspect-[21/9] w-full">
          <Image
            src="/hero/pulsar.gif"
            alt="PulsarVPN"
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 448px"
            unoptimized
            priority
          />
        </div>
        <Separator className="my-0" />
        <CardContent className="flex min-h-56 flex-col items-center justify-center gap-5 p-4 text-center">
          <div className="flex w-full flex-col items-center gap-4">
            <div className="flex w-full flex-col items-center gap-1">
              <p className="text-sm leading-5 text-muted-foreground">
                {subscriptionSummary.caption}
              </p>
              <p className="w-full text-center text-[26px] leading-8 font-semibold tracking-normal whitespace-nowrap">
                {subscriptionSummary.title}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Badge>{getSubscriptionStatusLabel(status)}</Badge>
              {subscription ? (
                <Badge variant="secondary">
                  {formatDeviceLimit(subscription.deviceLimit)}
                </Badge>
              ) : null}
              {subscription?.lteEnabled ? (
                <Badge variant="secondary">LTE</Badge>
              ) : null}
            </div>
          </div>
          <div className="grid w-full gap-3">
            <SubscriptionPaymentAction
              settings={settings}
              triggerLabel={renewalLabel}
            />
            <SetupVpnAction subscriptionUrl={subscription?.subscriptionUrl} />
          </div>
        </CardContent>
      </Card>

      <Link
        href="/referrals"
        className="group block"
        aria-label="Открыть реферальную систему"
      >
        <Card className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0 transition-colors hover:bg-card/55">
          <CardContent className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4">
            <GiftIcon className="size-8 text-muted-foreground transition-colors group-hover:text-foreground" />
            <div className="relative z-10 min-w-0">
              <p className="text-sm leading-5 text-muted-foreground transition-colors group-hover:text-foreground">
                <span className="block">Друг получает 3 дня бесплатно.</span>
                <span className="block">
                  Вы получаете 75 ₽ после его оплаты.
                </span>
              </p>
            </div>
            <ChevronRightIcon className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
          </CardContent>
        </Card>
      </Link>
    </main>
  )
}

function getHomeSubscriptionSummary(
  subscription: Subscription | null,
  status: SubscriptionStatus
) {
  if (!subscription || status === SubscriptionStatus.NONE) {
    return {
      caption: "Подписка не активна",
      title: "Оплатите подписку",
    }
  }

  if (
    status === SubscriptionStatus.EXPIRED ||
    status === SubscriptionStatus.CANCELED
  ) {
    return {
      caption: subscription.expiresAt
        ? `Доступ закончился ${formatSubscriptionDate(subscription.expiresAt)}`
        : "Доступ не активен",
      title: "Подписка закончилась",
    }
  }

  if (!subscription.expiresAt) {
    return {
      caption: "Подписка активна",
      title: "Доступ подключён",
    }
  }

  const daysLeft = formatDaysLeft(subscription.expiresAt)

  return {
    caption: `До ${formatSubscriptionDate(subscription.expiresAt)}`,
    title: `Осталось ${formatDaysLeftLabel(daysLeft)}`,
  }
}

function formatSubscriptionDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

function formatDaysLeft(expiresAt: Date) {
  const msInDay = 24 * 60 * 60 * 1000

  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / msInDay))
}

function formatDaysLeftLabel(days: number) {
  return `${days} ${pluralizeRu(days, ["день", "дня", "дней"])}`
}

function formatDeviceLimit(deviceLimit: number) {
  return `${deviceLimit} ${pluralizeRu(deviceLimit, [
    "устройство",
    "устройства",
    "устройств",
  ])}`
}

function pluralizeRu(value: number, forms: [string, string, string]) {
  const abs = Math.abs(value)
  const mod10 = abs % 10
  const mod100 = abs % 100

  if (mod10 === 1 && mod100 !== 11) {
    return forms[0]
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1]
  }

  return forms[2]
}
