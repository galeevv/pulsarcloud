import {
  PaymentProvider,
  PaymentStatus,
  WalletLedgerDirection,
  WalletLedgerStatus,
  WalletLedgerType,
  WebhookProcessingStatus,
  type Prisma,
} from "@/generated/prisma/client"

import { ConflictError } from "@/lib/application-errors"
import { prisma } from "@/lib/db"
import { hashValue } from "@/lib/security"
import { runInTransaction } from "@/lib/transactions"
import { confirmPaymentInTransaction } from "@/src/server/services/billing/payment-service"
import {
  getPaymentProvider,
  type VerifiedPaymentWebhook,
} from "@/src/server/services/payments/provider"

export async function verifyAndProcessPaymentWebhook(
  providerType: PaymentProvider,
  rawBody: string,
  headers: Headers
) {
  const provider = getPaymentProvider(providerType)
  // Signature verification is adapter work and happens before any mutation.
  const verified = await provider.verifyWebhook({ rawBody, headers })
  const payloadHash = hashValue(rawBody)

  const event = await runInTransaction(prisma, async (tx) => {
    const existing = await tx.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: providerType,
          providerEventId: verified.providerEventId,
        },
      },
    })

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ConflictError(
          "Provider event id was reused with a different payload.",
          { providerEventId: verified.providerEventId }
        )
      }

      return existing
    }

    return tx.paymentWebhookEvent.create({
      data: {
        provider: providerType,
        providerEventId: verified.providerEventId,
        eventType: verified.eventType,
        payloadHash,
        payload: verified.payload as Prisma.InputJsonValue,
        verifiedAt: new Date(),
      },
    })
  })

  try {
    return await applyVerifiedPaymentWebhook(event.id, verified)
  } catch (error) {
    await prisma.paymentWebhookEvent.updateMany({
      where: {
        id: event.id,
        status: {
          in: [
            WebhookProcessingStatus.RECEIVED,
            WebhookProcessingStatus.PROCESSING,
          ],
        },
      },
      data: {
        status: WebhookProcessingStatus.FAILED,
        attemptCount: { increment: 1 },
        lastError: error instanceof Error ? error.message : "Unknown webhook error",
      },
    })
    throw error
  }
}

function applyVerifiedPaymentWebhook(
  eventId: string,
  verified: VerifiedPaymentWebhook
) {
  return runInTransaction(prisma, async (tx) => {
    const event = await tx.paymentWebhookEvent.findUniqueOrThrow({
      where: { id: eventId },
    })

    if (
      event.status === WebhookProcessingStatus.PROCESSED ||
      event.status === WebhookProcessingStatus.IGNORED
    ) {
      return { duplicate: true, applied: false, paymentId: event.paymentId }
    }

    const claimed = await tx.paymentWebhookEvent.updateMany({
      where: {
        id: event.id,
        status: {
          in: [
            WebhookProcessingStatus.RECEIVED,
            WebhookProcessingStatus.FAILED,
          ],
        },
      },
      data: {
        status: WebhookProcessingStatus.PROCESSING,
        attemptCount: { increment: 1 },
        lastError: null,
      },
    })

    if (claimed.count !== 1) {
      return { duplicate: true, applied: false, paymentId: event.paymentId }
    }

    const payment = await tx.payment.findUnique({
      where: {
        provider_externalPaymentId: {
          provider: event.provider,
          externalPaymentId: verified.providerPaymentId,
        },
      },
    })

    if (!payment) {
      await markEventFailed(tx, event.id, "Payment not found for provider id.")
      return { duplicate: false, applied: false, paymentId: null }
    }

    if (payment.amountRub !== verified.amountRub || verified.currency !== "RUB") {
      await markEventFailed(tx, event.id, "Webhook amount or currency mismatch.")
      return { duplicate: false, applied: false, paymentId: payment.id }
    }

    await tx.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { paymentId: payment.id },
    })

    let applied = false
    switch (verified.eventType) {
      case "SUCCEEDED": {
        const result = await confirmPaymentInTransaction(tx, payment.id, {
          source: "provider.webhook",
          providerEventId: verified.providerEventId,
        })
        applied = result.applied
        break
      }
      case "PENDING":
        applied =
          (
            await tx.payment.updateMany({
              where: { id: payment.id, status: PaymentStatus.CREATED },
              data: { status: PaymentStatus.PENDING },
            })
          ).count === 1
        break
      case "FAILED":
        applied = await applyTerminalStatus(
          tx,
          payment.id,
          PaymentStatus.FAILED
        )
        break
      case "CANCELED":
        applied = await applyTerminalStatus(
          tx,
          payment.id,
          PaymentStatus.CANCELED
        )
        break
      case "REFUNDED":
      case "PARTIALLY_REFUNDED":
        applied = await applyRefund(tx, payment, event.id, verified)
        break
    }

    await tx.paymentWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: WebhookProcessingStatus.PROCESSED,
        processedAt: new Date(),
        lastError: null,
      },
    })

    return { duplicate: false, applied, paymentId: payment.id }
  })
}

async function applyTerminalStatus(
  tx: Parameters<typeof confirmPaymentInTransaction>[0],
  paymentId: string,
  status: "FAILED" | "CANCELED"
) {
  const changed = await tx.payment.updateMany({
    where: {
      id: paymentId,
      status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] },
    },
    data: {
      status,
      ...(status === PaymentStatus.FAILED
        ? { failedAt: new Date() }
        : { canceledAt: new Date() }),
    },
  })
  return changed.count === 1
}

async function applyRefund(
  tx: Parameters<typeof confirmPaymentInTransaction>[0],
  payment: Parameters<typeof assertRefundablePayment>[0],
  eventId: string,
  verified: VerifiedPaymentWebhook
) {
  assertRefundablePayment(payment)
  const cumulativeRefund = verified.refundedAmountRub

  if (!cumulativeRefund || cumulativeRefund > payment.amountRub) {
    throw new ConflictError("Invalid cumulative refund amount.", {
      paymentId: payment.id,
      cumulativeRefund,
    })
  }

  const delta = cumulativeRefund - payment.refundedAmountRub
  if (delta <= 0) {
    return false
  }

  const status =
    cumulativeRefund === payment.amountRub
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status,
      refundedAmountRub: cumulativeRefund,
      refundedAt: new Date(),
    },
  })
  await tx.walletLedgerEntry.create({
    data: {
      userId: payment.userId,
      paymentId: payment.id,
      direction: WalletLedgerDirection.DEBIT,
      amountRub: delta,
      type: WalletLedgerType.PAYMENT_REFUND,
      status: WalletLedgerStatus.POSTED,
      postedAt: new Date(),
      idempotencyKey: `payment:${payment.id}:refund-event:${eventId}`,
    },
  })
  await tx.auditEvent.create({
    data: {
      eventType: `payment.${status.toLowerCase()}`,
      entityType: "Payment",
      entityId: payment.id,
      idempotencyKey: `audit:payment:${payment.id}:refund-event:${eventId}`,
      data: { cumulativeRefund, delta },
    },
  })
  return true
}

function assertRefundablePayment(payment: {
  id: string
  status: PaymentStatus
  amountRub: number
  refundedAmountRub: number
  userId: string
}) {
  if (
    payment.status !== PaymentStatus.SUCCEEDED &&
    payment.status !== PaymentStatus.PARTIALLY_REFUNDED
  ) {
    throw new ConflictError("Payment is not refundable from its current state.", {
      paymentId: payment.id,
      status: payment.status,
    })
  }
}

function markEventFailed(
  tx: Parameters<typeof confirmPaymentInTransaction>[0],
  eventId: string,
  message: string
) {
  return tx.paymentWebhookEvent.update({
    where: { id: eventId },
    data: { status: WebhookProcessingStatus.FAILED, lastError: message },
  })
}
