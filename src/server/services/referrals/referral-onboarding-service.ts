import {
  JobType,
  ReferralInviteStatus,
  ReferralRewardKind,
  ReferralRewardStatus,
  SubscriptionStatus,
  WalletLedgerDirection,
  WalletLedgerStatus,
  WalletLedgerType,
  type Prisma,
} from "@/generated/prisma/client"

const TRIAL_DAYS = 3

export async function applyReferralOnboarding(
  tx: Prisma.TransactionClient,
  invitedUserId: string,
  inviteCode?: string
) {
  if (!inviteCode) return null

  const existing = await tx.referralInvite.findUnique({
    where: { invitedUserId },
  })
  if (existing) return existing

  const [inviterProfile, pricing] = await Promise.all([
    tx.referralProfile.findUnique({ where: { inviteCode } }),
    tx.pricingVersion.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { version: "desc" },
    }),
  ])
  if (
    !inviterProfile?.isEnabled ||
    inviterProfile.userId === invitedUserId ||
    !pricing
  ) {
    return null
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
  const invite = await tx.referralInvite.create({
    data: {
      inviterId: inviterProfile.userId,
      invitedUserId,
      inviteCodeSnapshot: inviterProfile.inviteCode,
      status: ReferralInviteStatus.CONVERTED,
      convertedAt: now,
    },
  })
  const subscription = await tx.subscription.create({
    data: {
      userId: invitedUserId,
      status: SubscriptionStatus.TRIAL,
      startsAt: now,
      expiresAt,
      deviceLimit: pricing.minDeviceLimit,
      lteEnabled: false,
      syncStatus: "PENDING",
    },
  })
  await tx.subscriptionPeriod.create({
    data: {
      subscriptionId: subscription.id,
      startsAt: now,
      endsAt: expiresAt,
      deviceLimit: pricing.minDeviceLimit,
      lteEnabled: false,
      amountRub: 0,
    },
  })

  if (pricing.referralRewardRub > 0) {
    const reward = await tx.referralReward.create({
      data: {
        inviteId: invite.id,
        inviterId: inviterProfile.userId,
        invitedUserId,
        kind: ReferralRewardKind.REGISTRATION,
        amountRub: pricing.referralRewardRub,
        status: ReferralRewardStatus.AVAILABLE,
        availableAt: now,
      },
    })
    await tx.walletLedgerEntry.create({
      data: {
        userId: inviterProfile.userId,
        referralRewardId: reward.id,
        direction: WalletLedgerDirection.CREDIT,
        amountRub: pricing.referralRewardRub,
        type: WalletLedgerType.REFERRAL_REWARD,
        status: WalletLedgerStatus.POSTED,
        postedAt: now,
        idempotencyKey: `referral:${invite.id}:registration-reward`,
      },
    })
    await tx.user.update({
      where: { id: inviterProfile.userId },
      data: { balanceRub: { increment: pricing.referralRewardRub } },
    })
  }

  await tx.job.create({
    data: {
      type: JobType.PROVISION_SUBSCRIPTION,
      idempotencyKey: `subscription:${subscription.id}:referral-trial`,
      payload: { subscriptionId: subscription.id, referralInviteId: invite.id },
    },
  })
  await tx.auditEvent.create({
    data: {
      eventType: "referral.registration_rewarded",
      entityType: "ReferralInvite",
      entityId: invite.id,
      idempotencyKey: `audit:referral:${invite.id}:registration`,
      data: {
        trialDays: TRIAL_DAYS,
        rewardRub: pricing.referralRewardRub,
      },
    },
  })

  return invite
}
