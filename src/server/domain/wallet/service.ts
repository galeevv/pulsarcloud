import { db, withBusyRetry } from "@/src/server/infrastructure/db/client"
import { BusinessError } from "@/src/server/application/errors"
import { encryptSensitive } from "@/src/server/infrastructure/security/crypto"
import { getConfig } from "@/src/server/config"

function maskDetails(value: string) {
  const compact = value.replace(/\s+/g, " ").trim()
  return compact.length <= 6
    ? "***"
    : `${compact.slice(0, 2)}***${compact.slice(-4)}`
}

export async function createPayout(input: {
  userId: string
  amountMinor: number
  details: string
  idempotencyKey: string
}) {
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    input.details.trim().length < 4 ||
    input.details.length > 500 ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 200
  )
    throw new BusinessError("INVALID_INPUT")
  return withBusyRetry(() =>
    db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: input.userId } })
      if (!user || user.isTest !== getConfig().testMode)
        throw new BusinessError("AUTH_FORBIDDEN", 403)
      const existing = await tx.payoutRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      })
      if (existing) {
        if (
          existing.userId !== input.userId ||
          existing.amountMinor !== input.amountMinor
        )
          throw new BusinessError(
            "CONFLICT",
            409,
            "Payout idempotency key belongs to a different request"
          )
        return existing
      }
      const pricing = await tx.pricingSettings.findUniqueOrThrow({
        where: { key: "default" },
      })
      if (input.amountMinor < pricing.minimalPayoutMinor)
        throw new BusinessError("PAYOUT_BELOW_MINIMUM")
      const wallet = await tx.walletAccount.findUniqueOrThrow({
        where: { userId: input.userId },
      })
      if (wallet.availableMinor < input.amountMinor)
        throw new BusinessError("WALLET_INSUFFICIENT_BALANCE")
      const payout = await tx.payoutRequest.create({
        data: {
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
          amountMinor: input.amountMinor,
          payoutDetailsEncrypted: encryptSensitive(input.details.trim()),
          payoutDetailsMasked: maskDetails(input.details),
        },
      })
      const changed = await tx.walletAccount.updateMany({
        where: { id: wallet.id, availableMinor: { gte: input.amountMinor } },
        data: {
          availableMinor: { decrement: input.amountMinor },
          reservedMinor: { increment: input.amountMinor },
          version: { increment: 1 },
        },
      })
      if (!changed.count) throw new BusinessError("WALLET_INSUFFICIENT_BALANCE")
      const updated = await tx.walletAccount.findUniqueOrThrow({
        where: { id: wallet.id },
      })
      if (updated.availableMinor < 0 || updated.reservedMinor < 0)
        throw new BusinessError("WALLET_INSUFFICIENT_BALANCE")
      await tx.walletLedgerEntry.create({
        data: {
          walletAccountId: wallet.id,
          userId: input.userId,
          type: "PAYOUT_RESERVE",
          deltaAvailableMinor: -input.amountMinor,
          deltaReservedMinor: input.amountMinor,
          referenceType: "PayoutRequest",
          referenceId: payout.id,
          idempotencyKey: `payout:${payout.id}:reserve`,
        },
      })
      return payout
    })
  )
}

export async function transitionPayout(input: {
  payoutId: string
  adminUserId: string
  action: "APPROVE" | "REJECT" | "PAID"
  reason?: string
  correlationId: string
}) {
  if (!["APPROVE", "REJECT", "PAID"].includes(input.action))
    throw new BusinessError("INVALID_INPUT")
  return withBusyRetry(() =>
    db.$transaction(async (tx) => {
      const payout = await tx.payoutRequest.findUniqueOrThrow({
        where: { id: input.payoutId },
        include: { user: { include: { wallet: true } } },
      })
      if (input.action === "APPROVE" && payout.status !== "PENDING")
        throw new BusinessError("CONFLICT")
      if (input.action === "PAID" && payout.status !== "APPROVED")
        throw new BusinessError("CONFLICT")
      if (
        input.action === "REJECT" &&
        !["PENDING", "APPROVED"].includes(payout.status)
      )
        throw new BusinessError("CONFLICT")
      const wallet = payout.user.wallet!
      if (input.action === "APPROVE")
        await tx.payoutRequest.update({
          where: { id: payout.id },
          data: {
            status: "APPROVED",
            reviewedByAdminId: input.adminUserId,
            reviewedAt: new Date(),
          },
        })
      else if (input.action === "REJECT") {
        const updated = await tx.walletAccount.update({
          where: { id: wallet.id },
          data: {
            availableMinor: { increment: payout.amountMinor },
            reservedMinor: { decrement: payout.amountMinor },
            version: { increment: 1 },
          },
        })
        if (updated.reservedMinor < 0) throw new BusinessError("CONFLICT")
        await tx.walletLedgerEntry.create({
          data: {
            walletAccountId: wallet.id,
            userId: payout.userId,
            type: "PAYOUT_RELEASE",
            deltaAvailableMinor: payout.amountMinor,
            deltaReservedMinor: -payout.amountMinor,
            referenceType: "PayoutRequest",
            referenceId: payout.id,
            idempotencyKey: `payout:${payout.id}:release`,
          },
        })
        await tx.payoutRequest.update({
          where: { id: payout.id },
          data: {
            status: "REJECTED",
            reviewedByAdminId: input.adminUserId,
            reviewedAt: new Date(),
            rejectionReason: input.reason?.slice(0, 500),
          },
        })
      } else {
        const updated = await tx.walletAccount.update({
          where: { id: wallet.id },
          data: {
            reservedMinor: { decrement: payout.amountMinor },
            version: { increment: 1 },
          },
        })
        if (updated.reservedMinor < 0) throw new BusinessError("CONFLICT")
        await tx.walletLedgerEntry.create({
          data: {
            walletAccountId: wallet.id,
            userId: payout.userId,
            type: "PAYOUT_PAID",
            deltaAvailableMinor: 0,
            deltaReservedMinor: -payout.amountMinor,
            referenceType: "PayoutRequest",
            referenceId: payout.id,
            idempotencyKey: `payout:${payout.id}:paid`,
          },
        })
        await tx.payoutRequest.update({
          where: { id: payout.id },
          data: {
            status: "PAID",
            reviewedByAdminId: input.adminUserId,
            reviewedAt: new Date(),
          },
        })
      }
      if (input.action === "APPROVE" || input.action === "PAID") {
        await tx.outboxJob.create({
          data: {
            type: "SEND_TELEGRAM_NOTIFICATION",
            aggregateType: "PayoutRequest",
            aggregateId: payout.id,
            payloadJson: JSON.stringify({
              userId: payout.userId,
              template:
                input.action === "APPROVE" ? "PAYOUT_APPROVED" : "PAYOUT_PAID",
            }),
            dedupeKey: `telegram:payout:${payout.id}:${input.action.toLowerCase()}`,
            maxAttempts: 5,
          },
        })
      }
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: input.adminUserId,
          action: `PAYOUT_${input.action}`,
          entityType: "PayoutRequest",
          entityId: payout.id,
          metadataJson: JSON.stringify({ reason: input.reason }),
          correlationId: input.correlationId,
        },
      })
    })
  )
}
