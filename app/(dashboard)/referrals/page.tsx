import Image from "next/image"
import { GiftIcon, Link2Icon, UsersIcon, WalletIcon } from "lucide-react"
import { SubscriptionStatus } from "@prisma/client"

import { CopyButton } from "@/components/app/copy-button"
import { PayoutDialog } from "@/components/app/payout-dialog"
import { ReferralsMetrics } from "@/components/app/referrals-metrics"
import { SubscriptionPaymentAction } from "@/components/app/subscription-payment-action"
import { Card, CardContent } from "@/components/ui/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { formatRub } from "@/lib/pricing"
import { getEffectiveSubscriptionStatus } from "@/lib/subscription"

export default async function ReferralsPage() {
  const user = await requireUser()
  const [profile, settings, subscription, invites, payouts] = await Promise.all(
    [
      prisma.referralProfile.findUnique({ where: { userId: user.id } }),
      prisma.pricingSettings.findUniqueOrThrow({ where: { id: "default" } }),
      prisma.subscription.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.referralInvite.findMany({
        where: { inviterId: user.id },
        include: {
          invited: {
            select: {
              createdAt: true,
              email: true,
              telegramId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payoutRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]
  )
  const subscriptionStatus = getEffectiveSubscriptionStatus(subscription)
  const shouldShowReferralEmpty =
    !profile?.isEnabled &&
    (!subscription || subscriptionStatus === SubscriptionStatus.NONE)

  if (shouldShowReferralEmpty) {
    return (
      <main className="pulsar-container">
        <Card className="gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0">
          <div className="relative aspect-[21/9] w-full">
            <Image
              src="/details/physics.gif"
              alt="Реферальная программа Pulsar"
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 448px"
              unoptimized
              priority
            />
          </div>
          <Separator className="my-0" />
          <CardContent className="flex min-h-56 flex-col justify-center p-4">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GiftIcon />
                </EmptyMedia>
                <EmptyTitle>
                  Реферальная программа откроется после оплаты
                </EmptyTitle>
                <EmptyDescription>
                  После подтверждения платежа здесь появится ваша ссылка.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <SubscriptionPaymentAction
                  settings={settings}
                  triggerLabel="Оплатить подписку"
                />
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      </main>
    )
  }

  const invitedCount = invites.length
  const activeCount = invites.filter(
    (invite) => invite.status === "PAID"
  ).length
  const paidOutRub = payouts
    .filter((payout) => payout.status === "PAID")
    .reduce((sum, payout) => sum + payout.amountRub, 0)
  const canRequestPayout = user.balanceRub >= settings.minimalPayoutRub
  const inviteItems = invites.map((invite) => ({
    createdAtLabel: formatReferralDate(invite.createdAt),
    id: invite.id,
    statusLabel: formatReferralStatus(invite.status),
    userLabel:
      invite.invited.email ??
      (invite.invited.telegramId
        ? `Telegram ${invite.invited.telegramId}`
        : "Пользователь Pulsar"),
  }))
  const activeInviteItems = inviteItems.filter(
    (_, index) => invites[index]?.status === "PAID"
  )
  const payoutItems = payouts.map((payout) => ({
    amountLabel: formatRub(payout.amountRub),
    createdAtLabel: formatReferralDate(payout.createdAt),
    id: payout.id,
    statusLabel: formatReferralStatus(payout.status),
  }))
  const inviteUrl =
    profile?.inviteUrl || `https://pulsarr.space/?invite=${user.id.slice(-7)}`

  return (
    <main className="pulsar-container">
      <Card className="gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0">
        <div className="relative aspect-[21/9] w-full">
          <Image
            src="/details/physics.gif"
            alt="Реферальная программа Pulsar"
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 448px"
            unoptimized
            priority
          />
        </div>
        <Separator className="my-0" />
        <CardContent className="flex min-h-56 flex-col justify-center gap-4 p-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[26px] leading-8 font-semibold tracking-normal">
              Реферальная программа
            </p>
          </div>

          <div className="soft-panel grid min-h-[62px] grid-cols-[auto_1fr_auto] items-center gap-3 p-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/40">
              <WalletIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] leading-4 text-muted-foreground">
                Баланс
              </p>
              <p className="truncate text-base leading-5 font-semibold">
                {formatRub(user.balanceRub)}
              </p>
            </div>
            <PayoutDialog
              buttonIcon={false}
              canRequestPayout={canRequestPayout}
              defaultAmountRub={Math.min(
                user.balanceRub || settings.minimalPayoutRub,
                Math.max(user.balanceRub, settings.minimalPayoutRub)
              )}
              minimalPayoutRub={settings.minimalPayoutRub}
              triggerClassName="h-9 w-auto rounded-[14px] px-3"
            />
          </div>

          <ReferralLinkCard inviteUrl={inviteUrl} />

          <ReferralsMetrics
            activeInvites={activeInviteItems}
            activeValue={String(activeCount)}
            invitedValue={String(invitedCount)}
            invites={inviteItems}
            paidOutValue={formatRub(paidOutRub)}
            payouts={payoutItems}
          />

          <ReferralStepsCarousel />
        </CardContent>
      </Card>
    </main>
  )
}

function ReferralLinkCard({ inviteUrl }: { inviteUrl: string }) {
  return (
    <div className="soft-panel flex items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/40">
          <Link2Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Ваша ссылка</p>
          <p className="truncate font-mono text-sm">
            {formatCompactReferralUrl(inviteUrl)}
          </p>
        </div>
      </div>
      <CopyButton
        value={inviteUrl}
        label="Скопировать ссылку"
        iconOnly
        className="size-9"
      />
    </div>
  )
}

function ReferralStepsCarousel() {
  return (
    <Carousel className="w-full" opts={{ align: "start" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Как это работает</p>
        <div className="flex items-center gap-2">
          <CarouselPrevious className="static inset-auto m-0 translate-x-0 translate-y-0" />
          <CarouselNext className="static inset-auto m-0 translate-x-0 translate-y-0" />
        </div>
      </div>
      <CarouselContent className="-ml-3 pt-3">
        {referralSteps.map((step) => (
          <CarouselItem key={step.title} className="basis-full pl-3">
            <div className="soft-panel flex min-h-36 flex-col gap-3 p-4">
              <div className="flex size-9 items-center justify-center rounded-xl border border-border/70 bg-background/40">
                <step.icon className="size-4" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="text-sm leading-5 text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  )
}

const referralSteps = [
  {
    title: "75 ₽ за друга — это реально",
    description: "Отправьте ссылку и получите 75 ₽ за оплату друга.",
    icon: GiftIcon,
  },
  {
    title: "Бонус новым пользователям",
    description: "Ваш друг получит 3 дня подписки бесплатно.",
    icon: UsersIcon,
  },
  {
    title: "Простой вывод средств",
    description: "Вывод средств доступен при балансе от 150 ₽.",
    icon: WalletIcon,
  },
]

function formatCompactReferralUrl(url: string) {
  try {
    const parsedUrl = new URL(url)
    const code = parsedUrl.searchParams.get("invite")

    if (code) {
      return `${parsedUrl.host}/?invite=${code.slice(0, 4)}...${code.slice(-4)}`
    }

    return parsedUrl.host
  } catch {
    return url.length > 28 ? `${url.slice(0, 18)}...${url.slice(-6)}` : url
  }
}

function formatReferralStatus(status: string) {
  const labels: Record<string, string> = {
    APPROVED: "Одобрено",
    AVAILABLE: "Доступно",
    CANCELED: "Отменено",
    PAID: "Выплачено",
    PENDING: "В обработке",
    REJECTED: "Отклонено",
    RESERVED: "Зарезервировано",
  }

  return labels[status] ?? status.toLowerCase()
}

function formatReferralDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}
