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
  // Реферальный trial — отдельная награда за приглашение и не зависит от
  // промокампаний из /admin/promos.
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
      lteEnabled: true,
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

export async function grantReferralSubscriptionReward(
  tx: Prisma.TransactionClient,
  input: { invitedUserId: string; paymentId: string; now?: Date }
) {
  const invite = await tx.referralInvite.findUnique({
    where: { invitedUserId: input.invitedUserId },
    include: {
      reward: true,
      subscriptionReward: true,
      inviter: { include: { subscription: true } },
      invited: true,
    },
  })
  if (!invite || invite.reward || invite.subscriptionReward) return null
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
  const now = input.now ?? new Date()
  const current = invite.inviter.subscription
  const previousExpiresAt = current?.expiresAt ?? null
  const base =
    current && current.expiresAt > now ? current.expiresAt : now
  const expiresAt = new Date(
    base.getTime() + pricing.referralRewardDays * DAY
  )
  const syncVersion = (current?.syncVersion ?? 0) + 1
  const subscription = current
    ? await tx.subscription.update({
        where: { id: current.id },
        data: {
          status: "ACTIVE",
          expiresAt,
          syncStatus: "PENDING",
          syncVersion,
          lastTechnicalError: null,
          lastUserFriendlyError: null,
        },
      })
    : await tx.subscription.create({
        data: {
          userId: invite.inviterUserId,
          status: "ACTIVE",
          startedAt: now,
          expiresAt,
          deviceLimit: pricing.minDeviceLimit,
          lteEnabled: false,
          syncStatus: "PENDING",
          syncVersion,
        },
      })
  const reward = await tx.referralSubscriptionReward.create({
    data: {
      inviteId: invite.id,
      inviterUserId: invite.inviterUserId,
      invitedUserId: input.invitedUserId,
      paymentId: input.paymentId,
      days: pricing.referralRewardDays,
    },
  })
  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: subscription.id,
      type: "REFERRAL_DAYS_GRANTED",
      paymentId: input.paymentId,
      actorUserId: input.invitedUserId,
      previousStateJson: current ? JSON.stringify(current) : null,
      newStateJson: JSON.stringify({
        ...subscription,
        referralRewardDays: pricing.referralRewardDays,
        previousExpiresAt,
      }),
      idempotencyKey: `referral-days:${invite.id}`,
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
  await tx.referralInvite.update({
    where: { id: invite.id },
    data: {
      status: "PAID",
      convertedAt: now,
      firstConfirmedPaymentId: input.paymentId,
    },
  })
  return reward
}
