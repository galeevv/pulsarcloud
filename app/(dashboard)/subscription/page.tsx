import type { Metadata } from "next"
import type { ComponentProps } from "react"
import {
  AlertCircleIcon,
  CalendarClockIcon,
  InfoIcon,
  KeyRoundIcon,
  Link2Icon,
  RadioIcon,
  SmartphoneIcon,
} from "lucide-react"
import { CopyButton } from "@/components/app/copy-button"
import { RegenerateLinkDialog } from "@/components/app/regenerate-link-dialog"
import {
  PulsarActionRow,
  PulsarAssetCard,
  PulsarIconContainer,
  pulsarLinkButtonClass,
} from "@/components/app/pulsar-primitives"
import { SubscriptionPaymentAction } from "@/components/app/subscription-payment-action"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import {
  getPricingView,
  getSubscriptionView,
} from "@/src/server/queries/user-dashboard"
import { requireWebSession } from "@/src/server/transport/web/session"
import type {
  PreviewSubscription,
  PreviewSubscriptionStatus,
} from "@/src/frontend-preview/view-models"

export const metadata: Metadata = {
  title: "Подписка",
}

export default async function SubscriptionPage() {
  const session = await requireWebSession("USER")
  const [subscription, settings] = await Promise.all([
    getSubscriptionView(session.userId),
    getPricingView(),
  ])
  const status = subscription?.status ?? "NONE"
  const hasActiveSubscription =
    subscription && ["ACTIVE", "TRIAL"].includes(status)
  const hasSubscriptionRecord = Boolean(subscription && status !== "NONE")
  const subscriptionSummary = getSubscriptionSummary(subscription, status)
  const subscriptionProgress = subscription
    ? getRemainingSubscriptionProgress(subscription)
    : 0
  const subscriptionProgressTone = subscription
    ? getProgressTone(subscription, status, subscriptionProgress)
    : "inactive"

  return (
    <main className="pulsar-container">
      <PulsarAssetCard
        src="/details/observed.gif"
        alt="PulsarVPN"
        contentClassName="flex min-h-56 flex-col justify-center gap-4"
      >
        {hasSubscriptionRecord ? (
          <div className="flex flex-col items-center text-center">
            <h1 className="text-[26px] leading-8 font-semibold tracking-normal">
              {subscriptionSummary.title}
            </h1>
          </div>
        ) : (
          <h1 className="sr-only">Подписка</h1>
        )}

        {!hasSubscriptionRecord ? (
          <SubscriptionEmptyState settings={settings} />
        ) : subscription ? (
          <>
            {hasActiveSubscription ? (
              <SubscriptionUrlCard url={subscription.subscriptionUrl} />
            ) : null}

            <div className="soft-panel flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Период доступа</span>
                <span className="font-medium">
                  {subscription.expiresAt
                    ? `до ${formatSubscriptionDate(subscription.expiresAt)}`
                    : "без срока"}
                </span>
              </div>
              <Progress
                value={subscriptionProgress}
                aria-label="Период доступа подписки"
                data-tone={subscriptionProgressTone}
                className="pulsar-progress w-full"
              />
            </div>

            {subscription.nextDeviceLimit !== null ||
            subscription.nextLteEnabled !== null ? (
              <Alert>
                <CalendarClockIcon />
                <AlertTitle>Параметры следующего периода</AlertTitle>
                <AlertDescription>
                  {subscription.nextParametersAt
                    ? `С ${formatSubscriptionDate(subscription.nextParametersAt)} — `
                    : "После окончания текущего периода — "}
                  {formatDeviceLimit(
                    subscription.nextDeviceLimit ?? subscription.deviceLimit
                  )}
                  ,{" "}
                  {(subscription.nextLteEnabled ?? subscription.lteEnabled)
                    ? "с LTE"
                    : "без LTE"}
                  .
                </AlertDescription>
              </Alert>
            ) : null}

            {subscription.lastUserFriendlyError &&
            subscription.syncStatus !== "FAILED" ? (
              <Alert>
                <AlertCircleIcon />
                <AlertTitle>Нужна проверка</AlertTitle>
                <AlertDescription>
                  {subscription.lastUserFriendlyError}
                </AlertDescription>
              </Alert>
            ) : null}

            {hasActiveSubscription ? (
              subscription.syncStatus === "SYNCED" &&
              subscription.subscriptionUrl ? (
                <div className="flex flex-col gap-3">
                  <a
                    href={subscription.subscriptionUrl}
                    className={pulsarLinkButtonClass()}
                  >
                    <Link2Icon data-icon="inline-start" />
                    Подключить в Happ
                  </a>
                  <RegenerateLinkDialog />
                  <SubscriptionPaymentAction
                    settings={settings}
                    triggerLabel="Продлить подписку"
                    initialDeviceLimit={
                      subscription.nextDeviceLimit ?? subscription.deviceLimit
                    }
                    initialLteEnabled={
                      subscription.nextLteEnabled ?? subscription.lteEnabled
                    }
                    renewsActiveSubscription
                  />
                </div>
              ) : (
                <ProvisioningStatus subscription={subscription} />
              )
            ) : (
              <SubscriptionPaymentAction
                settings={settings}
                triggerLabel="Возобновить подписку"
                initialDeviceLimit={
                  subscription.nextDeviceLimit ?? subscription.deviceLimit
                }
                initialLteEnabled={
                  subscription.nextLteEnabled ?? subscription.lteEnabled
                }
              />
            )}
          </>
        ) : (
          <SubscriptionEmptyState settings={settings} />
        )}
      </PulsarAssetCard>

      {hasSubscriptionRecord && subscription ? (
        <SubscriptionDevicesCard subscription={subscription} />
      ) : null}
    </main>
  )
}

function SubscriptionEmptyState({
  settings,
}: {
  settings: ComponentProps<typeof SubscriptionPaymentAction>["settings"]
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RadioIcon />
        </EmptyMedia>
        <EmptyTitle>Оплатите подписку</EmptyTitle>
        <EmptyDescription>
          После оплаты здесь появится ссылка для Happ.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="w-full">
        <SubscriptionPaymentAction
          settings={settings}
          triggerLabel="Оплатить подписку"
        />
      </EmptyContent>
    </Empty>
  )
}

function SubscriptionUrlCard({ url }: { url: string | null }) {
  return (
    <PulsarActionRow
      icon={KeyRoundIcon}
      title="Ключ подписки"
      titleClassName="text-xs font-normal text-muted-foreground"
      description={
        <span className="font-mono text-sm text-foreground">
          {url ? formatCompactSubscriptionUrl(url) : "Ссылка появится позже"}
        </span>
      }
      action={
        url ? (
          <CopyButton value={url} label="Скопировать ключ" iconOnly />
        ) : null
      }
    />
  )
}

function SubscriptionDevicesCard({
  subscription,
}: {
  subscription: PreviewSubscription
}) {
  return (
    <Card className="rounded-3xl border border-border/70 bg-card/40 py-0">
      <CardHeader className="p-4 pb-0">
        <CardTitle>Устройства</CardTitle>
        <CardDescription>
          По тарифу можно подключить до{" "}
          {formatDeviceLimit(subscription.deviceLimit)}.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">Лимит: {subscription.deviceLimit}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="p-4">
        <div className="soft-panel flex items-center gap-3 p-4">
          <PulsarIconContainer icon={SmartphoneIcon} size="md" />
          <p className="text-sm text-muted-foreground">
            Фактическая статистика подключений появится после синхронизации с
            Remnawave.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function ProvisioningStatus({
  subscription,
}: {
  subscription: PreviewSubscription
}) {
  if (subscription.syncStatus === "FAILED") {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Не удалось подготовить подключение</AlertTitle>
        <AlertDescription>
          {subscription.lastUserFriendlyError ??
            "Мы повторим синхронизацию автоматически. Если ссылка не появится, напишите в поддержку."}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert>
      <InfoIcon />
      <AlertTitle>Готовим подключение</AlertTitle>
      <AlertDescription>
        Подписка уже активна. Ссылка для Happ появится после синхронизации —
        повторная оплата не требуется.
      </AlertDescription>
    </Alert>
  )
}

function getSubscriptionSummary(
  subscription: PreviewSubscription | null,
  status: PreviewSubscriptionStatus
) {
  if (!subscription || status === "NONE") {
    return {
      title: "Оплатите подписку",
    }
  }

  if (status === "EXPIRED" || status === "CANCELED") {
    return {
      title: "Подписка закончилась",
    }
  }

  return {
    title: "Подписка",
  }
}

function getProgressTone(
  subscription: { expiresAt: Date | null },
  status: string,
  progress: number
) {
  if (status === "EXPIRED" || status === "CANCELED" || progress <= 0) {
    return "danger"
  }

  if (!subscription.expiresAt) {
    return "healthy"
  }

  const daysLeft = getDaysLeft(subscription.expiresAt)

  if (daysLeft <= 7 || progress <= 18) {
    return "danger"
  }

  if (daysLeft <= 14 || progress <= 35) {
    return "warning"
  }

  return "healthy"
}

function getRemainingSubscriptionProgress(subscription: {
  startsAt: Date | null
  expiresAt: Date | null
}) {
  if (!subscription.startsAt || !subscription.expiresAt) {
    return 100
  }

  const start = subscription.startsAt.getTime()
  const end = subscription.expiresAt.getTime()
  const total = end - start

  if (total <= 0) {
    return 0
  }

  const remaining = end - Date.now()
  const value = (remaining / total) * 100

  return Math.min(100, Math.max(0, Math.round(value)))
}

function getDaysLeft(expiresAt: Date) {
  const msInDay = 24 * 60 * 60 * 1000

  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / msInDay))
}

function formatSubscriptionDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

function formatCompactSubscriptionUrl(url: string) {
  try {
    const parsedUrl = new URL(url)
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean)
    const token = pathSegments[pathSegments.length - 1] ?? ""

    if (!token) {
      return parsedUrl.host
    }

    return `${parsedUrl.host}/...${token.slice(-8)}`
  } catch {
    const token = url.split("/").filter(Boolean).at(-1) ?? ""

    return token ? `...${token.slice(-10)}` : url
  }
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
