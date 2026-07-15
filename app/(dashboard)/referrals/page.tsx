import type { Metadata } from "next"
import { GiftIcon, Link2Icon, UsersIcon, WalletIcon } from "lucide-react"
import { CopyButton } from "@/components/app/copy-button"
import { PayoutDialog } from "@/components/app/payout-dialog"
import {
  PulsarActionRow,
  PulsarAssetCard,
  PulsarIconContainer,
} from "@/components/app/pulsar-primitives"
import { ReferralsMetrics } from "@/components/app/referrals-metrics"
import { SubscriptionPaymentAction } from "@/components/app/subscription-payment-action"
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
import { formatPreviewRub } from "@/src/frontend-preview/format"
import {
  getPricingView,
  getLastPurchasePreferencesView,
  getSubscriptionView,
  getReferralsView,
} from "@/src/server/queries/user-dashboard"
import { requireWebSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = {
  title: { absolute: "PULSAR" },
}

export default async function ReferralsPage() {
  const session = await requireWebSession("USER")
  const [{ user, inviteUrl }, settings, subscription, lastPurchase] =
    await Promise.all([
      getReferralsView(session.userId),
      getPricingView(session.userId),
      getSubscriptionView(session.userId),
      getLastPurchasePreferencesView(session.userId),
    ])
  const balanceRub = (user.wallet?.availableMinor ?? 0) / 100
  if (!user.referralProfile?.isEnabled)
    return (
      <main className="pulsar-container">
        <h1 className="sr-only">Реферальная программа</h1>
        <PulsarAssetCard
          src="/details/physics.gif"
          alt="Реферальная программа Pulsar"
          contentClassName="flex min-h-56 flex-col justify-center"
        >
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GiftIcon />
              </EmptyMedia>
              <EmptyTitle>Реферальная программа</EmptyTitle>
              <EmptyDescription>
                Оплатите подписку — персональная ссылка появится здесь
                автоматически.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <SubscriptionPaymentAction
                settings={settings}
                walletBalanceRub={balanceRub}
                triggerLabel={
                  subscription ? "Продлить подписку" : "Оплатить подписку"
                }
                initialDeviceLimit={lastPurchase?.deviceLimit}
                initialLteEnabled={lastPurchase?.lteEnabled}
              />
            </EmptyContent>
          </Empty>
        </PulsarAssetCard>
      </main>
    )
  const inviteItems = user.sentInvites.map((invite) => ({
    id: invite.id,
    createdAtLabel: formatDate(invite.createdAt),
    statusLabel: formatStatus(invite.status),
    userLabel:
      invite.invited.identities.find(
        (identity) => identity.provider === "EMAIL"
      )?.providerSubject ??
      (invite.invited.identities.find(
        (identity) => identity.provider === "TELEGRAM"
      )?.telegramUsername
        ? `@${invite.invited.identities.find((identity) => identity.provider === "TELEGRAM")?.telegramUsername}`
        : "Пользователь Pulsar"),
  }))
  const activeInviteItems = inviteItems.filter(
    (_, index) => user.sentInvites[index]?.status === "PAID"
  )
  const payoutItems = user.payouts.map((payout) => ({
    id: payout.id,
    amountLabel: formatPreviewRub(payout.amountMinor / 100),
    createdAtLabel: formatDate(payout.createdAt),
    statusLabel: formatStatus(payout.status),
  }))
  const paidOutRub = user.payouts
    .filter((payout) => payout.status === "PAID")
    .reduce((sum, payout) => sum + payout.amountMinor / 100, 0)
  return (
    <main className="pulsar-container">
      <PulsarAssetCard
        src="/details/physics.gif"
        alt="Реферальная программа Pulsar"
        contentClassName="flex min-h-56 flex-col justify-center gap-4"
      >
        <div className="text-center">
          <h1 className="text-[26px] leading-8 font-semibold">
            Реферальная программа
          </h1>
        </div>
        <PulsarActionRow
          icon={WalletIcon}
          title="Баланс"
          titleClassName="text-xs font-normal text-muted-foreground"
          description={
            <span className="text-base font-semibold text-foreground">
              {formatPreviewRub(balanceRub)}
            </span>
          }
          action={
            <PayoutDialog
              buttonIcon={false}
              canRequestPayout={balanceRub >= settings.minimalPayoutRub}
              defaultAmountRub={Math.max(settings.minimalPayoutRub, balanceRub)}
              minimalPayoutRub={settings.minimalPayoutRub}
              triggerClassName="h-9 w-auto rounded-[14px] px-3"
            />
          }
        />
        {inviteUrl ? (
          <PulsarActionRow
            icon={Link2Icon}
            title="Ваша ссылка"
            titleClassName="text-xs font-normal text-muted-foreground"
            description={
              <span className="font-mono text-sm text-foreground">
                {compactUrl(inviteUrl)}
              </span>
            }
            action={
              <CopyButton
                value={inviteUrl}
                label="Скопировать ссылку"
                iconOnly
                className="size-9"
              />
            }
          />
        ) : null}
        <ReferralsMetrics
          activeInvites={activeInviteItems}
          activeValue={String(activeInviteItems.length)}
          invitedValue={String(inviteItems.length)}
          invites={inviteItems}
          paidOutValue={formatPreviewRub(paidOutRub)}
          payouts={payoutItems}
        />
        <ReferralSteps
          minimalPayoutRub={settings.minimalPayoutRub}
          referralRewardRub={settings.referralRewardRub}
          referralTrialDays={settings.referralTrialDays}
        />
      </PulsarAssetCard>
    </main>
  )
}

function ReferralSteps({
  minimalPayoutRub,
  referralRewardRub,
  referralTrialDays,
}: {
  minimalPayoutRub: number
  referralRewardRub: number
  referralTrialDays: number
}) {
  const steps = [
    {
      title: `Пригласите друга и получите ${formatPreviewRub(referralRewardRub)}`,
      description: "Бонус начислим после его первой оплаты.",
      icon: GiftIcon,
    },
    {
      title: `Друг получит ${formatDaysLabel(referralTrialDays)} бесплатно`,
      description: "Пробный период выдаётся один раз при регистрации.",
      icon: UsersIcon,
    },
    {
      title: `Накопили ${formatPreviewRub(minimalPayoutRub)} — выводите`,
      description: "Создайте заявку прямо из личного кабинета.",
      icon: WalletIcon,
    },
  ]
  return (
    <Carousel className="w-full" opts={{ align: "start" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Как это работает</p>
        <div className="flex gap-2">
          <CarouselPrevious className="static inset-auto m-0 translate-x-0 translate-y-0" />
          <CarouselNext className="static inset-auto m-0 translate-x-0 translate-y-0" />
        </div>
      </div>
      <CarouselContent className="-ml-3 pt-3">
        {steps.map((step) => (
          <CarouselItem key={step.title} className="basis-full pl-3">
            <div className="soft-panel flex flex-col gap-3 p-4">
              <PulsarIconContainer icon={step.icon} />
              <div>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="text-sm text-muted-foreground">
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
function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}
function formatStatus(status: string) {
  return (
    (
      {
        REGISTERED: "Зарегистрирован",
        TRIAL_GRANTED: "Пробный период",
        PAID: "Оплатил",
        REWARD_REVERSED: "Возврат",
        PENDING: "В обработке",
        APPROVED: "Одобрено",
        REJECTED: "Отклонено",
        CANCELED: "Отменено",
      } as Record<string, string>
    )[status] ?? status
  )
}
function compactUrl(url: string) {
  const parsed = new URL(url)
  const code = parsed.searchParams.get("invite") ?? ""
  return `${parsed.host}/?invite=${code.slice(0, 4)}…${code.slice(-4)}`
}

function formatDaysLabel(days: number) {
  return `${days} ${pluralizeRu(days, ["день", "дня", "дней"])}`
}

function pluralizeRu(value: number, forms: [string, string, string]) {
  const mod10 = Math.abs(value) % 10
  const mod100 = Math.abs(value) % 100

  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1]
  }

  return forms[2]
}
