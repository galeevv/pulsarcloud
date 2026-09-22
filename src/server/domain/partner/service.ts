import type { Prisma } from "@/src/generated/prisma/client"

/**
 * Начисляет партнёрскую комиссию в рамках транзакции подтверждения платежа.
 * Ставка и сумма сохраняются в записи комиссии, поэтому будущие изменения
 * настроек партнёра не пересчитывают историю.
 */
export async function grantPartnerCommission(
  tx: Prisma.TransactionClient,
  input: { invitedUserId: string; paymentId: string; now?: Date }
) {
  const existing = await tx.partnerCommission.findUnique({
    where: { paymentId: input.paymentId },
  })
  if (existing) return existing

  const payment = await tx.payment.findUnique({
    where: { id: input.paymentId },
  })
  if (!payment || payment.userId !== input.invitedUserId) return null
  if (payment.status !== "CONFIRMED") return null
  if (payment.purpose !== "SUBSCRIPTION") return null

  const invite = await tx.referralInvite.findUnique({
    where: { invitedUserId: input.invitedUserId },
    include: {
      inviter: { select: { id: true, isTest: true, status: true } },
      invited: { select: { id: true, isTest: true } },
    },
  })
  if (
    !invite ||
    invite.inviter.status !== "ACTIVE" ||
    invite.inviter.isTest !== invite.invited.isTest
  )
    return null

  const enrollment = await tx.partnerEnrollment.findUnique({
    where: { userId: invite.inviterUserId },
  })
  if (!enrollment?.enabled || enrollment.rateBps <= 0) return null

  const amountMinor = Math.floor(
    (payment.amountMinor * enrollment.rateBps) / 10_000
  )
  if (amountMinor <= 0) return null

  const now = input.now ?? new Date()
  const wallet = await tx.walletAccount.upsert({
    where: { userId: invite.inviterUserId },
    create: { userId: invite.inviterUserId },
    update: {},
  })
  const updatedWallet = await tx.walletAccount.update({
    where: { id: wallet.id },
    data: {
      availableMinor: { increment: amountMinor },
      version: { increment: 1 },
    },
  })
  const commission = await tx.partnerCommission.create({
    data: {
      enrollmentId: enrollment.id,
      inviteId: invite.id,
      inviterUserId: invite.inviterUserId,
      invitedUserId: input.invitedUserId,
      paymentId: payment.id,
      baseAmountMinor: payment.amountMinor,
      amountMinor,
      currency: payment.currency,
      rateBps: enrollment.rateBps,
      status: "AVAILABLE",
      createdAt: now,
    },
  })
  await tx.walletLedgerEntry.create({
    data: {
      walletAccountId: updatedWallet.id,
      userId: invite.inviterUserId,
      type: "PARTNER_COMMISSION",
      deltaAvailableMinor: amountMinor,
      deltaReservedMinor: 0,
      referenceType: "PartnerCommission",
      referenceId: commission.id,
      idempotencyKey: `partner-commission:${payment.id}`,
      description: `Комиссия ${enrollment.rateBps / 100}% за платёж приглашённого пользователя`,
      createdAt: now,
    },
  })
  await tx.outboxJob.create({
    data: {
      type: "SEND_TELEGRAM_NOTIFICATION",
      aggregateType: "PartnerCommission",
      aggregateId: commission.id,
      payloadJson: JSON.stringify({
        userId: invite.inviterUserId,
        template: "PARTNER_COMMISSION_CREATED",
        commissionId: commission.id,
      }),
      dedupeKey: `telegram:partner-commission:${commission.id}`,
      maxAttempts: 5,
    },
  })
  return commission
}

export async function reversePartnerCommission(
  tx: Prisma.TransactionClient,
  input: { paymentId: string; now?: Date }
) {
  const commission = await tx.partnerCommission.findUnique({
    where: { paymentId: input.paymentId },
  })
  if (!commission || commission.status === "REVERSED") return null
  const now = input.now ?? new Date()
  const wallet = await tx.walletAccount.findUnique({
    where: { userId: commission.inviterUserId },
  })
  if (!wallet) return null
  await tx.partnerCommission.update({
    where: { id: commission.id },
    data: { status: "REVERSED", reversedAt: now },
  })
  const updatedWallet = await tx.walletAccount.update({
    where: { id: wallet.id },
    data: {
      availableMinor: { decrement: commission.amountMinor },
      version: { increment: 1 },
    },
  })
  await tx.walletLedgerEntry.create({
    data: {
      walletAccountId: updatedWallet.id,
      userId: commission.inviterUserId,
      type: "PARTNER_COMMISSION_REVERSAL",
      deltaAvailableMinor: -commission.amountMinor,
      deltaReservedMinor: 0,
      referenceType: "PartnerCommission",
      referenceId: commission.id,
      idempotencyKey: `partner-commission-reversal:${input.paymentId}`,
      description: "Отмена комиссии после возврата платежа",
      createdAt: now,
    },
  })
  return commission
}
