import {
  PayoutRequestStatus,
  WalletLedgerDirection,
  WalletLedgerStatus,
  WalletLedgerType,
} from "@prisma/client"

import { prisma } from "@/lib/db"

export async function createPayoutRequest(
  userId: string,
  amountRub: number,
  payoutDetails: string
) {
  const settings = await prisma.pricingSettings.findUniqueOrThrow({
    where: { id: "default" },
  })
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  if (amountRub < settings.minimalPayoutRub) {
    throw new Error("Минимальная сумма вывода ещё не набрана.")
  }

  if (amountRub > user.balanceRub) {
    throw new Error("Недостаточно доступного баланса.")
  }

  const payout = await prisma.payoutRequest.create({
    data: {
      userId,
      amountRub,
      payoutDetails,
      status: PayoutRequestStatus.PENDING,
    },
  })

  await prisma.walletLedgerEntry.create({
    data: {
      userId,
      direction: WalletLedgerDirection.DEBIT,
      amountRub,
      type: WalletLedgerType.PAYOUT_RESERVE,
      status: WalletLedgerStatus.POSTED,
      idempotencyKey: `payout:${payout.id}:reserve`,
    },
  })

  await prisma.user.update({
    where: { id: userId },
    data: {
      balanceRub: {
        decrement: amountRub,
      },
    },
  })

  return payout
}

export async function approvePayoutRequest(
  payoutId: string,
  adminUserId: string,
  adminNote?: string
) {
  const payout = await prisma.payoutRequest.update({
    where: { id: payoutId },
    data: {
      status: PayoutRequestStatus.APPROVED,
      approvedAt: new Date(),
      approvedById: adminUserId,
      adminNote,
    },
  })

  await audit(adminUserId, "payout.approve", payout.id)

  return payout
}

export async function markPayoutRequestPaid(
  payoutId: string,
  adminUserId: string,
  adminNote?: string
) {
  const payout = await prisma.payoutRequest.update({
    where: { id: payoutId },
    data: {
      status: PayoutRequestStatus.PAID,
      paidAt: new Date(),
      paidById: adminUserId,
      adminNote,
    },
  })

  await prisma.walletLedgerEntry.create({
    data: {
      userId: payout.userId,
      direction: WalletLedgerDirection.DEBIT,
      amountRub: payout.amountRub,
      type: WalletLedgerType.PAYOUT_PAID,
      status: WalletLedgerStatus.POSTED,
      idempotencyKey: `payout:${payout.id}:paid`,
    },
  })
  await audit(adminUserId, "payout.paid", payout.id)

  return payout
}

export async function rejectPayoutRequest(
  payoutId: string,
  adminUserId: string,
  adminNote?: string
) {
  const payout = await prisma.payoutRequest.update({
    where: { id: payoutId },
    data: {
      status: PayoutRequestStatus.REJECTED,
      rejectedAt: new Date(),
      rejectedById: adminUserId,
      adminNote,
    },
  })

  await prisma.walletLedgerEntry.create({
    data: {
      userId: payout.userId,
      direction: WalletLedgerDirection.CREDIT,
      amountRub: payout.amountRub,
      type: WalletLedgerType.PAYOUT_REFUND,
      status: WalletLedgerStatus.POSTED,
      idempotencyKey: `payout:${payout.id}:refund`,
    },
  })
  await prisma.user.update({
    where: { id: payout.userId },
    data: {
      balanceRub: {
        increment: payout.amountRub,
      },
    },
  })
  await audit(adminUserId, "payout.reject", payout.id)

  return payout
}

async function audit(actorUserId: string, action: string, entityId: string) {
  await prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      entityType: "PayoutRequest",
      entityId,
    },
  })
}
