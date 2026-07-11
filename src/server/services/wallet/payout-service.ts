import {
  PayoutRequestStatus,
  WalletLedgerDirection,
  WalletLedgerStatus,
  WalletLedgerType,
  type Prisma,
} from "@/generated/prisma/client"

import { ConflictError, NotFoundError, ValidationError } from "@/lib/application-errors"
import { prisma } from "@/lib/db"
import { getActivePricingVersion } from "@/lib/pricing-data"
import { runInTransaction } from "@/lib/transactions"

export function createPayoutRequest(
  userId: string,
  amountRub: number,
  payoutDetails: string,
  idempotencyKey: string
) {
  return runInTransaction(prisma, async (tx) => {
    const existing = await tx.payoutRequest.findUnique({
      where: { idempotencyKey },
    })

    if (existing) {
      return existing
    }

    const settings = await getActivePricingVersion(tx)

    if (amountRub < settings.minimalPayoutRub) {
      throw new ValidationError("Минимальная сумма вывода ещё не набрана.")
    }

    const reserved = await tx.user.updateMany({
      where: { id: userId, balanceRub: { gte: amountRub } },
      data: { balanceRub: { decrement: amountRub } },
    })

    if (reserved.count !== 1) {
      throw new ConflictError("Недостаточно доступного баланса.")
    }

    const payout = await tx.payoutRequest.create({
      data: {
        userId,
        amountRub,
        payoutDetails,
        idempotencyKey,
      },
    })
    await tx.walletLedgerEntry.create({
      data: {
        userId,
        payoutRequestId: payout.id,
        direction: WalletLedgerDirection.DEBIT,
        amountRub,
        type: WalletLedgerType.PAYOUT_RESERVE,
        status: WalletLedgerStatus.POSTED,
        postedAt: new Date(),
        idempotencyKey: `payout:${payout.id}:reserve`,
      },
    })

    return payout
  })
}

export function approvePayoutRequest(
  payoutId: string,
  adminUserId: string,
  adminNote?: string
) {
  return transitionPayout(
    payoutId,
    [PayoutRequestStatus.PENDING],
    PayoutRequestStatus.APPROVED,
    adminUserId,
    adminNote
  )
}

export function markPayoutRequestPaid(
  payoutId: string,
  adminUserId: string,
  adminNote?: string
) {
  return transitionPayout(
    payoutId,
    [PayoutRequestStatus.APPROVED],
    PayoutRequestStatus.PAID,
    adminUserId,
    adminNote
  )
}

export function rejectPayoutRequest(
  payoutId: string,
  adminUserId: string,
  adminNote?: string
) {
  return runInTransaction(prisma, async (tx) => {
    const payout = await getPayout(tx, payoutId)

    if (
      payout.status !== PayoutRequestStatus.PENDING &&
      payout.status !== PayoutRequestStatus.APPROVED
    ) {
      throw new ConflictError("Payout cannot be rejected from its current state.", {
        payoutId,
        status: payout.status,
      })
    }

    const changed = await tx.payoutRequest.updateMany({
      where: {
        id: payoutId,
        status: { in: [PayoutRequestStatus.PENDING, PayoutRequestStatus.APPROVED] },
      },
      data: {
        status: PayoutRequestStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedById: adminUserId,
        adminNote,
      },
    })

    if (changed.count !== 1) {
      throw new ConflictError("Payout state changed concurrently.", { payoutId })
    }

    await tx.walletLedgerEntry.create({
      data: {
        userId: payout.userId,
        payoutRequestId: payout.id,
        direction: WalletLedgerDirection.CREDIT,
        amountRub: payout.amountRub,
        type: WalletLedgerType.PAYOUT_RELEASE,
        status: WalletLedgerStatus.POSTED,
        postedAt: new Date(),
        idempotencyKey: `payout:${payout.id}:release`,
      },
    })
    await tx.user.update({
      where: { id: payout.userId },
      data: { balanceRub: { increment: payout.amountRub } },
    })
    await audit(tx, adminUserId, "payout.rejected", payout.id)

    return tx.payoutRequest.findUniqueOrThrow({ where: { id: payout.id } })
  })
}

function transitionPayout(
  payoutId: string,
  allowedStatuses: PayoutRequestStatus[],
  nextStatus: PayoutRequestStatus,
  adminUserId: string,
  adminNote?: string
) {
  return runInTransaction(prisma, async (tx) => {
    await getPayout(tx, payoutId)
    const now = new Date()
    const changed = await tx.payoutRequest.updateMany({
      where: { id: payoutId, status: { in: allowedStatuses } },
      data: {
        status: nextStatus,
        adminNote,
        ...(nextStatus === PayoutRequestStatus.APPROVED
          ? { approvedAt: now, approvedById: adminUserId }
          : { paidAt: now, paidById: adminUserId }),
      },
    })

    if (changed.count !== 1) {
      throw new ConflictError("Payout cannot transition from its current state.", {
        payoutId,
        nextStatus,
      })
    }

    await audit(tx, adminUserId, `payout.${nextStatus.toLowerCase()}`, payoutId)
    return tx.payoutRequest.findUniqueOrThrow({ where: { id: payoutId } })
  })
}

async function getPayout(tx: Prisma.TransactionClient, payoutId: string) {
  const payout = await tx.payoutRequest.findUnique({ where: { id: payoutId } })

  if (!payout) {
    throw new NotFoundError("Payout not found.", { payoutId })
  }

  return payout
}

function audit(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  eventType: string,
  entityId: string
) {
  return tx.auditEvent.create({
    data: {
      actorUserId,
      eventType,
      entityType: "PayoutRequest",
      entityId,
      idempotencyKey: `audit:${eventType}:${entityId}`,
    },
  })
}
