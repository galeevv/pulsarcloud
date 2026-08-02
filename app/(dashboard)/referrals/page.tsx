import type { Metadata } from "next"
import { GiftIcon, Link2Icon } from "lucide-react"
import { CopyButton } from "@/components/app/copy-button"
import {
  PulsarAssetCard,
  PulsarActionRow,
} from "@/components/app/pulsar-primitives"
import { ReferralsMetrics } from "@/components/app/referrals-metrics"
import { SubscriptionPaymentAction } from "@/components/app/subscription-payment-action"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
  const rewardItems = user.sentInvites.flatMap((invite) => {
    if (!invite.subscriptionReward) return []
    return [
      {
        id: invite.subscriptionReward.id,
        daysLabel: `+${formatDaysLabel(invite.subscriptionReward.days)}`,
        createdAtLabel: formatDate(invite.subscriptionReward.createdAt),
        userLabel:
          invite.invited.identities.find(
            (identity) => identity.provider === "EMAIL"
          )?.providerSubject ?? "Пользователь Pulsar",
      },
    ]
  })
  const earnedDays = user.sentInvites.reduce(
    (sum, invite) => sum + (invite.subscriptionReward?.days ?? 0),
    0
  )
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
        {inviteUrl ? (
          <section className="flex flex-col" aria-labelledby="invite-title">
            <h2 id="invite-title" className="sr-only">
              Ваша реферальная ссылка
            </h2>
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
          </section>
        ) : null}
        <ReferralsMetrics
          activeInvites={activeInviteItems}
          activeValue={String(activeInviteItems.length)}
          friendTrialLabel={formatDaysLabel(settings.referralTrialDays)}
          invitedValue={String(inviteItems.length)}
          invites={inviteItems}
          ownerRewardDays={settings.referralRewardDays}
          earnedDays={earnedDays}
          rewards={rewardItems}
        />
      </PulsarAssetCard>
    </main>
  )
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Moscow",
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
