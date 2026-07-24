import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

function identityLabel(
  identities: Array<{
    provider: "EMAIL" | "TELEGRAM"
    emailNormalized: string | null
    telegramUsername: string | null
    telegramId: string | null
  }>
) {
  const telegram = identities.find(
    (identity) => identity.provider === "TELEGRAM"
  )
  if (telegram?.telegramUsername)
    return telegram.telegramUsername.startsWith("@")
      ? telegram.telegramUsername
      : `@${telegram.telegramUsername}`
  const email = identities.find((identity) => identity.provider === "EMAIL")
  return email?.emailNormalized ?? telegram?.telegramId ?? "Без контакта"
}

export async function getAdminPromosView() {
  await requireWebSession("ADMIN")
  const now = new Date()
  const isTest = getConfig().testMode
  const [campaigns, recentClaims, failedSyncs] = await Promise.all([
    db.promoCampaign.findMany({
      where: { isTest },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.promoClaim.findMany({
      where: { campaign: { isTest } },
      orderBy: { grantedAt: "desc" },
      take: 30,
      include: {
        campaign: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            identities: {
              select: {
                provider: true,
                emailNormalized: true,
                telegramUsername: true,
                telegramId: true,
              },
            },
            subscription: {
              select: {
                status: true,
                syncStatus: true,
                expiresAt: true,
              },
            },
          },
        },
      },
    }),
    db.subscription.count({
      where: {
        syncStatus: "FAILED",
        user: {
          promoClaims: {
            some: { campaign: { isTest } },
          },
        },
      },
    }),
  ])

  const activeCampaign =
    campaigns.find(
      (campaign) =>
        campaign.status === "ACTIVE" &&
        campaign.startsAt &&
        campaign.startsAt <= now &&
        (!campaign.endsAt || campaign.endsAt > now) &&
        campaign.claimedCount < campaign.claimLimit
    ) ?? null
  const totalGranted = campaigns.reduce(
    (sum, campaign) => sum + campaign.claimedCount,
    0
  )

  return {
    generatedAt: now,
    metrics: {
      activeCampaignName: activeCampaign?.name ?? null,
      totalGranted,
      remaining: activeCampaign
        ? activeCampaign.claimLimit - activeCampaign.claimedCount
        : 0,
      failedSyncs,
    },
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      ended: Boolean(campaign.endsAt && campaign.endsAt <= now),
      progress:
        campaign.claimLimit > 0
          ? Math.round((campaign.claimedCount / campaign.claimLimit) * 100)
          : 0,
    })),
    recentClaims: recentClaims.map((claim) => ({
      id: claim.id,
      campaignId: claim.campaign.id,
      campaignName: claim.campaign.name,
      userId: claim.user.id,
      userLabel: identityLabel(claim.user.identities),
      claimNumber: claim.claimNumber,
      durationDays: claim.durationDays,
      deviceLimit: claim.deviceLimit,
      lteEnabled: claim.lteEnabled,
      entitlementExpiresAt: claim.entitlementExpiresAt,
      grantedAt: claim.grantedAt,
      subscriptionStatus: claim.user.subscription?.status ?? null,
      syncStatus: claim.user.subscription?.syncStatus ?? null,
    })),
  }
}

export type AdminPromosView = Awaited<ReturnType<typeof getAdminPromosView>>
