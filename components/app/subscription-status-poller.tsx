"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

type SubscriptionStatusPollerProps = {
  active: boolean
  initialSyncStatus: string
  initialHasSubscriptionUrl: boolean
  initialDeviceLimit?: number
}

export function SubscriptionStatusPoller({
  active,
  initialSyncStatus,
  initialHasSubscriptionUrl,
  initialDeviceLimit,
}: SubscriptionStatusPollerProps) {
  const router = useRouter()

  React.useEffect(() => {
    if (!active) return

    let disposed = false
    let requestRunning = false
    let refreshRequested = false

    const poll = async () => {
      if (disposed || requestRunning || refreshRequested) return
      requestRunning = true
      try {
        const response = await fetch("/api/subscription/status", {
          cache: "no-store",
        })
        if (!response.ok) return
        const result = (await response.json()) as {
          subscription?: {
            syncStatus: string
            hasSubscriptionUrl: boolean
            deviceLimit: number
          } | null
        }
        const subscription = result.subscription
        if (
          subscription &&
          (subscription.syncStatus !== initialSyncStatus ||
            subscription.hasSubscriptionUrl !== initialHasSubscriptionUrl ||
            (initialDeviceLimit !== undefined &&
              subscription.deviceLimit !== initialDeviceLimit))
        ) {
          refreshRequested = true
          router.refresh()
        }
      } catch {
        // Provisioning continues server-side; the next poll retries quietly.
      } finally {
        requestRunning = false
      }
    }

    const firstPoll = window.setTimeout(poll, 900)
    const timer = window.setInterval(poll, 2_500)
    return () => {
      disposed = true
      window.clearTimeout(firstPoll)
      window.clearInterval(timer)
    }
  }, [
    active,
    initialDeviceLimit,
    initialHasSubscriptionUrl,
    initialSyncStatus,
    router,
  ])

  return null
}
