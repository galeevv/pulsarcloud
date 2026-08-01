import type { Metadata } from "next"

import { InstructionsFlow } from "@/components/app/instructions-flow"
import { SubscriptionStatusPoller } from "@/components/app/subscription-status-poller"
import { Card, CardContent } from "@/components/ui/card"
import { getSubscriptionView } from "@/src/server/queries/user-dashboard"
import { requireWebSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = {
  title: { absolute: "PULSAR" },
}

export default async function InstructionsPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string | string[] }>
}) {
  const session = await requireWebSession("USER")
  const paymentStatus = (await searchParams).payment
  const subscription = await getSubscriptionView(session.userId)
  const hasActiveSubscription = Boolean(
    subscription &&
    ["ACTIVE", "TRIAL"].includes(subscription.status) &&
    subscription.expiresAt &&
    subscription.expiresAt > new Date()
  )
  const subscriptionUrl =
    hasActiveSubscription &&
    subscription?.syncStatus === "SYNCED" &&
    subscription.subscriptionUrl
      ? subscription.subscriptionUrl
      : null
  const shouldPollSubscription = Boolean(
    !subscriptionUrl &&
    (paymentStatus === "success" || hasActiveSubscription)
  )

  return (
    <main className="pulsar-container">
      <Card className="rounded-3xl border border-border/70 bg-card/40 py-0">
        <CardContent className="p-4">
          <SubscriptionStatusPoller
            active={shouldPollSubscription}
            initialSyncStatus={subscription?.syncStatus ?? "MISSING"}
            initialHasSubscriptionUrl={Boolean(subscription?.subscriptionUrl)}
            initialDeviceLimit={subscription?.deviceLimit}
          />
          <InstructionsFlow
            subscriptionUrl={subscriptionUrl}
            hasActiveSubscription={hasActiveSubscription}
          />
        </CardContent>
      </Card>
    </main>
  )
}
