import type { Prisma } from "@/src/generated/prisma/client"
import { BusinessError } from "@/src/server/application/errors"

const DAY = 86_400_000

export async function applyReferralOnRegistration(
  tx: Prisma.TransactionClient,
  input: { invitedUserId: string; inviteCode?: string | null; now?: Date }
) {
  if (!input.inviteCode) return null
  const profile = await tx.referralProfile.findUnique({
    where: { inviteCode: input.inviteCode },
    include: { user: true },
  })
  if (!profile || !profile.isEnabled || profile.user.status !== "ACTIVE")
    return null
  const invitedUser = await tx.user.findUnique({
    where: { id: input.invitedUserId },
  })
  if (!invitedUser || invitedUser.isTest !== profile.user.isTest)
    throw new BusinessError("REFERRAL_INVALID_INVITE")
  if (profile.userId === input.invitedUserId)
    throw new BusinessError("REFERRAL_INVALID_INVITE")
  const existing = await tx.referralInvite.findUnique({
    where: { invitedUserId: input.invitedUserId },
  })
  if (existing) return existing
  const pricing = await tx.pricingSettings.findUniqueOrThrow({
    where: { key: "default" },
  })
  const now = input.now ?? new Date()
  const invite = await tx.referralInvite.create({
    data: {
      inviterUserId: profile.userId,
      invitedUserId: input.invitedUserId,
      inviteCodeSnapshot: profile.inviteCode,
      status: "TRIAL_GRANTED",
    },
  })
  await tx.trialGrant.create({
    data: {
      userId: input.invitedUserId,
      reason: "REFERRAL",
      referralInviteId: invite.id,
      days: pricing.referralTrialDays,
    },
  })
  const subscription = await tx.subscription.create({
    data: {
      userId: input.invitedUserId,
      status: "TRIAL",
      startedAt: now,
      expiresAt: new Date(now.getTime() + pricing.referralTrialDays * DAY),
      deviceLimit: pricing.minDeviceLimit,
      lteEnabled: false,
      syncStatus: "PENDING",
      syncVersion: 1,
    },
  })
  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: subscription.id,
      type: "REFERRAL_TRIAL_GRANTED",
      newStateJson: JSON.stringify(subscription),
      idempotencyKey: `trial:${input.invitedUserId}`,
    },
  })
  await tx.outboxJob.create({
    data: {
      type: "PROVISION_SUBSCRIPTION",
      aggregateType: "Subscription",
      aggregateId: subscription.id,
      payloadJson: JSON.stringify({
        subscriptionId: subscription.id,
        syncVersion: 1,
      }),
      dedupeKey: `subscription:${subscription.id}:sync:1`,
    },
  })
  return invite
}

export async function grantReferralReward(
  tx: Prisma.TransactionClient,
  input: { invitedUserId: string; paymentId: string }
) {
  const invite = await tx.referralInvite.findUnique({
    where: { invitedUserId: input.invitedUserId },
    include: { reward: true, inviter: true, invited: true },
  })
  if (!invite || invite.reward) return null
  const payment = await tx.payment.findUnique({
    where: { id: input.paymentId },
  })
  if (
    !payment ||
    payment.userId !== input.invitedUserId ||
    invite.inviter.isTest !== invite.invited.isTest ||
    payment.isTest !== invite.invited.isTest
  )
    throw new BusinessError("REFERRAL_INVALID_INVITE")
  const firstConfirmed = await tx.payment.findFirst({
    where: {
      userId: input.invitedUserId,
      status: "CONFIRMED",
      isTest: payment.isTest,
    },
    orderBy: { confirmedAt: "asc" },
  })
  if (!firstConfirmed || firstConfirmed.id !== input.paymentId) return null
  const pricing = await tx.pricingSettings.findUniqueOrThrow({
    where: { key: "default" },
  })
  const reward = await tx.referralReward.create({
    data: {
      inviteId: invite.id,
      inviterUserId: invite.inviterUserId,
      invitedUserId: input.invitedUserId,
      paymentId: input.paymentId,
      amountMinor: pricing.referralRewardMinor,
    },
  })
  const wallet = await tx.walletAccount.update({
    where: { userId: invite.inviterUserId },
    data: {
      availableMinor: { increment: pricing.referralRewardMinor },
      version: { increment: 1 },
    },
  })
  await tx.walletLedgerEntry.create({
    data: {
      walletAccountId: wallet.id,
      userId: invite.inviterUserId,
      type: "REFERRAL_REWARD",
      deltaAvailableMinor: pricing.referralRewardMinor,
      deltaReservedMinor: 0,
      referenceType: "ReferralReward",
      referenceId: reward.id,
      idempotencyKey: `referral-reward:${invite.id}`,
    },
  })
  await tx.referralInvite.update({
    where: { id: invite.id },
    data: {
      status: "PAID",
      convertedAt: new Date(),
      firstConfirmedPaymentId: input.paymentId,
    },
  })
  return reward
}
