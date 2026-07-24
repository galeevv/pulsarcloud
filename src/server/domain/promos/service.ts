import type { Prisma } from "@/src/generated/prisma/client"
import { correlationId } from "@/src/server/infrastructure/security/crypto"

const DAY_MS = 86_400_000

export async function applyPromoOnRegistration(
  tx: Prisma.TransactionClient,
  input: { userId: string; now?: Date }
) {
  const now = input.now ?? new Date()
  const user = await tx.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      role: true,
      status: true,
      isTest: true,
      createdAt: true,
    },
  })
  if (!user || user.role !== "USER" || user.status !== "ACTIVE") return null

  const campaign = await tx.promoCampaign.findFirst({
    where: {
      isTest: user.isTest,
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
  })
  if (
    !campaign ||
    campaign.claimedCount >= campaign.claimLimit ||
    !campaign.startsAt ||
    user.createdAt < campaign.startsAt
  )
    return null

  const existingClaim = await tx.promoClaim.findUnique({
    where: {
      campaignId_userId: {
        campaignId: campaign.id,
        userId: user.id,
      },
    },
  })
  if (existingClaim) return existingClaim

  const current = await tx.subscription.findUnique({
    where: { userId: user.id },
  })
  if (current?.status === "ACTIVE" && current.expiresAt > now) return null

  const reserved = await tx.promoCampaign.updateMany({
    where: {
      id: campaign.id,
      status: "ACTIVE",
      claimedCount: campaign.claimedCount,
    },
    data: { claimedCount: { increment: 1 } },
  })
  if (!reserved.count) return null

  const entitlementExpiresAt = new Date(
    now.getTime() + campaign.durationDays * DAY_MS
  )
  const expiresAt =
    current?.expiresAt && current.expiresAt > entitlementExpiresAt
      ? current.expiresAt
      : entitlementExpiresAt
  const syncVersion = (current?.syncVersion ?? 0) + 1
  const subscription = current
    ? await tx.subscription.update({
        where: { id: current.id },
        data: {
          status: "TRIAL",
          startedAt: current.expiresAt > now ? current.startedAt : now,
          expiresAt,
          deviceLimit: Math.max(current.deviceLimit, campaign.deviceLimit),
          lteEnabled: current.lteEnabled || campaign.lteEnabled,
          nextDeviceLimit: null,
          nextLteEnabled: null,
          nextParametersAt: null,
          syncStatus: "PENDING",
          syncVersion,
          lastTechnicalError: null,
          lastUserFriendlyError: null,
        },
      })
    : await tx.subscription.create({
        data: {
          userId: user.id,
          status: "TRIAL",
          startedAt: now,
          expiresAt,
          deviceLimit: campaign.deviceLimit,
          lteEnabled: campaign.lteEnabled,
          syncStatus: "PENDING",
          syncVersion,
        },
      })
  const claim = await tx.promoClaim.create({
    data: {
      campaignId: campaign.id,
      userId: user.id,
      claimNumber: campaign.claimedCount + 1,
      durationDays: campaign.durationDays,
      deviceLimit: campaign.deviceLimit,
      lteEnabled: campaign.lteEnabled,
      entitlementExpiresAt,
      grantedAt: now,
    },
  })
  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: subscription.id,
      type: "PROMO_GRANTED",
      previousStateJson: current ? JSON.stringify(current) : null,
      newStateJson: JSON.stringify(subscription),
      idempotencyKey: `promo:${campaign.id}:user:${user.id}`,
    },
  })
  await tx.outboxJob.create({
    data: {
      type: "PROVISION_SUBSCRIPTION",
      aggregateType: "Subscription",
      aggregateId: subscription.id,
      payloadJson: JSON.stringify({
        subscriptionId: subscription.id,
        syncVersion,
      }),
      dedupeKey: `subscription:${subscription.id}:sync:${syncVersion}`,
    },
  })
  await tx.auditLog.create({
    data: {
      actorType: "SYSTEM",
      action: "PROMO_CLAIM_GRANTED",
      entityType: "PromoClaim",
      entityId: claim.id,
      metadataJson: JSON.stringify({
        campaignId: campaign.id,
        userId: user.id,
        claimNumber: claim.claimNumber,
        durationDays: claim.durationDays,
        deviceLimit: claim.deviceLimit,
        lteEnabled: claim.lteEnabled,
      }),
      correlationId: correlationId(),
    },
  })
  return claim
}
