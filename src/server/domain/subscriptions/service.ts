import { BusinessError } from "@/src/server/application/errors"
import { db, withBusyRetry } from "@/src/server/infrastructure/db/client"
import {
  getProvisioningProvider,
  SubscriberDeviceNotFoundError,
} from "@/src/server/infrastructure/remnawave/provider"

const REGENERATION_COOLDOWN_MS = 60_000
const ACTIVE_JOB_STATUSES = ["PENDING", "PROCESSING", "FAILED"] as const

async function getOwnedRemoteSubscription(userId: string) {
  const subscription = await db.subscription.findUnique({
    where: { userId },
    select: { remnawaveUserId: true },
  })
  if (!subscription?.remnawaveUserId)
    throw new BusinessError("SUBSCRIPTION_NOT_FOUND", 404)
  return subscription.remnawaveUserId
}

export async function getSubscriptionDevices(userId: string) {
  const remoteUserId = await getOwnedRemoteSubscription(userId)
  return getProvisioningProvider().getSubscriberDevices(remoteUserId)
}

export async function deleteSubscriptionDevice(input: {
  userId: string
  hwid: string
}) {
  const remoteUserId = await getOwnedRemoteSubscription(input.userId)
  try {
    return await getProvisioningProvider().deleteSubscriberDevice({
      remoteUserId,
      hwid: input.hwid,
    })
  } catch (error) {
    if (error instanceof SubscriberDeviceNotFoundError)
      throw new BusinessError("NOT_FOUND", 404)
    throw error
  }
}

export async function requestSubscriptionUrlRegeneration(
  userId: string,
  now = new Date()
) {
  try {
    return await withBusyRetry(() =>
      db.$transaction(async (tx) => {
        const subscription = await tx.subscription.findUnique({
          where: { userId },
        })
        if (!subscription?.remnawaveUserId)
          throw new BusinessError("SUBSCRIPTION_NOT_FOUND", 404)

        const activeJob = await tx.outboxJob.findFirst({
          where: {
            type: "REGENERATE_SUBSCRIPTION_URL",
            aggregateId: subscription.id,
            status: { in: [...ACTIVE_JOB_STATUSES] },
          },
          select: { id: true },
        })
        if (activeJob) throw new BusinessError("AUTH_RATE_LIMITED", 429)

        // Regeneration must not supersede a provisioning/plan sync that is
        // still in flight. That would make the earlier sync job stale.
        if (subscription.syncStatus !== "SYNCED")
          throw new BusinessError("CONFLICT", 409)

        const syncVersion = subscription.syncVersion + 1
        const changed = await tx.subscription.updateMany({
          where: {
            id: subscription.id,
            syncVersion: subscription.syncVersion,
            syncStatus: "SYNCED",
          },
          data: { syncVersion, syncStatus: "PENDING" },
        })
        if (!changed.count) throw new BusinessError("CONFLICT", 409)

        // The deterministic time bucket is the database-enforced cooldown.
        // It also closes the concurrent-request race through the unique
        // OutboxJob.dedupeKey constraint.
        const cooldownBucket = Math.floor(
          now.getTime() / REGENERATION_COOLDOWN_MS
        )
        const job = await tx.outboxJob.create({
          data: {
            type: "REGENERATE_SUBSCRIPTION_URL",
            aggregateType: "Subscription",
            aggregateId: subscription.id,
            payloadJson: JSON.stringify({
              subscriptionId: subscription.id,
              syncVersion,
            }),
            dedupeKey: `subscription:${subscription.id}:regenerate:${cooldownBucket}`,
          },
        })
        return { jobId: job.id, syncVersion }
      })
    )
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new BusinessError("AUTH_RATE_LIMITED", 429)
    throw error
  }
}
