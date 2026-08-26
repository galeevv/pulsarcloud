import type { Metadata } from "next"
import Link from "next/link"
import type { ComponentProps } from "react"
import {
  AlertCircleIcon,
  BookOpenIcon,
  InfoIcon,
  RadioIcon,
} from "lucide-react"
import { SubscriptionDevicesCard } from "@/components/app/subscription-devices-card"
import {
  PulsarAssetCard,
  pulsarLinkButtonClass,
} from "@/components/app/pulsar-primitives"
import { SubscriptionPaymentAction } from "@/components/app/subscription-payment-action"
import { SubscriptionStatusPoller } from "@/components/app/subscription-status-poller"
import { SubscriptionUrlCard } from "@/components/app/subscription-url-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getPricingView,
  getLastPurchasePreferencesView,
  getSubscriptionView,
  isDemoAccount,
} from "@/src/server/queries/user-dashboard"
import { requireWebSession } from "@/src/server/transport/web/session"
import type {
  PreviewSubscription,
  PreviewSubscriptionStatus,
} from "@/src/frontend-preview/view-models"

export const metadata: Metadata = {
  title: { absolute: "PULSAR" },
}

export default async function SubscriptionPage() {
  const session = await requireWebSession("USER")
  const [subscription, settings, lastPurchase, paymentsUnavailable] =
    await Promise.all([
      getSubscriptionView(session.userId),
      getPricingView(session.userId),
      getLastPurchasePreferencesView(session.userId),
      isDemoAccount(session.userId),
    ])
  const status = subscription?.status ?? "NONE"
  const hasActiveSubscription =
    subscription && ["ACTIVE", "TRIAL"].includes(status)
  const hasSubscriptionRecord = Boolean(subscription && status !== "NONE")
  const isConnectionReady = Boolean(
    hasActiveSubscription &&
    subscription?.syncStatus === "SYNCED" &&
    subscription?.subscriptionUrl
  )
  const subscriptionSummary = getSubscriptionSummary(subscription, status)

  return (
    <main className="pulsar-container">
      <PulsarAssetCard
        src="/details/observed.gif"
        alt="PulsarVPN"
        contentClassName="flex flex-col gap-4"
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
          <SubscriptionEmptyState
            settings={settings}
            paymentsUnavailable={paymentsUnavailable}
          />
        ) : subscription ? (
          <>
            {isConnectionReady ? (
              <SubscriptionUrlCard url={subscription.subscriptionUrl!} />
            ) : hasActiveSubscription ? (
              <SubscriptionProvisioningSkeleton />
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
              isConnectionReady && subscription.subscriptionUrl ? (
                <Link href="/instructions" className={pulsarLinkButtonClass()}>
                  <BookOpenIcon data-icon="inline-start" />
                  Инструкция
                </Link>
              ) : (
                <>
                  <SubscriptionStatusPoller
                    active
                    initialSyncStatus={subscription.syncStatus}
                    initialHasSubscriptionUrl={Boolean(
                      subscription.subscriptionUrl
                    )}
                    initialDeviceLimit={subscription.deviceLimit}
                  />
                  <ProvisioningStatus subscription={subscription} />
                </>
              )
            ) : (
              <SubscriptionPaymentAction
                settings={settings}
                triggerLabel="Возобновить подписку"
                initialDeviceLimit={lastPurchase?.deviceLimit}
                initialLteEnabled={lastPurchase?.lteEnabled}
                paymentsUnavailable={paymentsUnavailable}
              />
            )}
          </>
        ) : (
          <SubscriptionEmptyState
            settings={settings}
            paymentsUnavailable={paymentsUnavailable}
          />
        )}
      </PulsarAssetCard>

      {isConnectionReady && subscription ? (
        <SubscriptionDevicesCard
          deviceLimit={subscription.deviceLimit}
          maxDeviceLimit={settings.maxDeviceLimit}
          deviceLimitUpgradePriceRub={settings.deviceLimitUpgradePriceRub}
          pricingVersion={settings.pricingVersion}
          paymentsUnavailable={paymentsUnavailable}
        />
      ) : null}
    </main>
  )
}

function SubscriptionEmptyState({
  settings,
  paymentsUnavailable,
}: {
  settings: ComponentProps<typeof SubscriptionPaymentAction>["settings"]
  paymentsUnavailable: boolean
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RadioIcon />
        </EmptyMedia>
        <EmptyTitle>Подписка</EmptyTitle>
        <EmptyDescription>
          Здесь можно управлять подключением, устройствами и параметрами
          подписки.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="w-full">
        <SubscriptionPaymentAction
          settings={settings}
          triggerLabel="Оплатить подписку"
          paymentsUnavailable={paymentsUnavailable}
        />
      </EmptyContent>
    </Empty>
  )
}

function SubscriptionProvisioningSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="Готовим подключение">
      <div className="soft-panel flex min-h-[62px] items-center gap-3 p-3">
        <Skeleton className="size-9 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="size-8 shrink-0" />
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
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
      title: "Подписка",
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
