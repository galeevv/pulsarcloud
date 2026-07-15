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

export async function adjustWalletBalanceByAdmin(input: {
  adminUserId: string
  userId: string
  deltaMinor: number
  comment: string
  idempotencyKey: string
  correlationId: string
}) {
  const comment = input.comment.trim()
  if (
    input.adminUserId.length < 8 ||
    input.adminUserId.length > 100 ||
    input.userId.length < 8 ||
    input.userId.length > 100 ||
    !Number.isSafeInteger(input.deltaMinor) ||
    input.deltaMinor === 0 ||
    input.deltaMinor % 100 !== 0 ||
    Math.abs(input.deltaMinor) > 100_000_000 ||
    comment.length < 5 ||
    comment.length > 500 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.idempotencyKey
    ) ||
    input.correlationId.length < 8 ||
    input.correlationId.length > 200
  )
    throw new BusinessError("INVALID_INPUT")

  return withBusyRetry(() =>
    db.$transaction(async (tx) => {
      const admin = await tx.user.findUnique({
        where: { id: input.adminUserId },
      })
      if (
        !admin ||
        admin.role !== "ADMIN" ||
        admin.status !== "ACTIVE" ||
        admin.isTest !== getConfig().testMode
      )
        throw new BusinessError("ADMIN_FORBIDDEN", 403)
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        include: { wallet: true },
      })
      if (
        !user ||
        user.role !== "USER" ||
        user.isTest !== getConfig().testMode ||
        !user.wallet
      )
        throw new BusinessError("NOT_FOUND", 404)

      const idempotencyKey = `admin-wallet:${input.adminUserId}:${input.idempotencyKey}`
      const existing = await tx.walletLedgerEntry.findUnique({
        where: { idempotencyKey },
      })
      if (existing) {
        if (
          existing.userId !== input.userId ||
          existing.type !== "ADMIN_ADJUSTMENT" ||
          existing.deltaAvailableMinor !== input.deltaMinor ||
          existing.deltaReservedMinor !== 0 ||
          existing.referenceType !== "AdminAdjustment" ||
          existing.referenceId !== input.idempotencyKey ||
          existing.description !== comment
        )
          throw new BusinessError(
            "CONFLICT",
            409,
            "Wallet adjustment idempotency key belongs to a different request"
          )
        const wallet = await tx.walletAccount.findUniqueOrThrow({
          where: { id: existing.walletAccountId },
        })
        return {
          applied: false,
          availableMinor: wallet.availableMinor,
          ledgerEntryId: existing.id,
        }
      }

      const changed = await tx.walletAccount.updateMany({
        where: {
          id: user.wallet.id,
          ...(input.deltaMinor < 0
            ? { availableMinor: { gte: Math.abs(input.deltaMinor) } }
            : {}),
        },
        data: {
          availableMinor: { increment: input.deltaMinor },
          version: { increment: 1 },
        },
      })
      if (!changed.count)
        throw new BusinessError("WALLET_INSUFFICIENT_BALANCE", 409)

      const wallet = await tx.walletAccount.findUniqueOrThrow({
        where: { id: user.wallet.id },
      })
      if (wallet.availableMinor < 0)
        throw new BusinessError("WALLET_INSUFFICIENT_BALANCE", 409)

      const ledgerEntry = await tx.walletLedgerEntry.create({
        data: {
          walletAccountId: wallet.id,
          userId: input.userId,
          type: "ADMIN_ADJUSTMENT",
          deltaAvailableMinor: input.deltaMinor,
          deltaReservedMinor: 0,
          referenceType: "AdminAdjustment",
          referenceId: input.idempotencyKey,
          idempotencyKey,
          description: comment,
        },
      })
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: input.adminUserId,
          action: "WALLET_ADMIN_ADJUSTED",
          entityType: "WalletAccount",
          entityId: wallet.id,
          metadataJson: JSON.stringify({
            userId: input.userId,
            deltaMinor: input.deltaMinor,
            comment,
            ledgerEntryId: ledgerEntry.id,
          }),
          correlationId: input.correlationId,
        },
      })
      return {
        applied: true,
        availableMinor: wallet.availableMinor,
        ledgerEntryId: ledgerEntry.id,
      }
    })
  )
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
