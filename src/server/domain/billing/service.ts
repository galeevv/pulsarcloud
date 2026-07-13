import { randomUUID } from "node:crypto"
import { db, withBusyRetry } from "@/src/server/infrastructure/db/client"
import { getConfig } from "@/src/server/config"
import { calculatePrice } from "@/src/server/domain/billing/pricing"
import {
  getPaymentProvider,
  PaymentCheckoutRejectedError,
  type VerifiedPaymentEvent,
} from "@/src/server/infrastructure/payments/provider"
import { BusinessError } from "@/src/server/application/errors"
import { grantReferralReward } from "@/src/server/domain/referrals/service"
import {
  correlationId,
  stableEventId,
} from "@/src/server/infrastructure/security/crypto"

const PAYMENT_RECONCILIATION_DELAY_MS = 60_000

export async function expireOverduePendingPayments(input?: {
  now?: Date
  userId?: string
}) {
  const now = input?.now ?? new Date()
  return withBusyRetry(() =>
    db.payment.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lte: now },
        ...(input?.userId ? { userId: input.userId } : {}),
      },
      data: { status: "EXPIRED" },
    })
  )
}

export async function createCheckout(input: {
  userId: string
  durationMonths: number
  deviceLimit: number
  lteEnabled: boolean
  idempotencyKey?: string
}) {
  const config = getConfig()
  if (!config.testMode && !config.payments.enabled)
    throw new BusinessError("INTEGRATION_TEMPORARILY_UNAVAILABLE", 503)
  const user = await db.user.findUnique({ where: { id: input.userId } })
  if (!user || user.status !== "ACTIVE" || user.isTest !== config.testMode)
    throw new BusinessError("AUTH_FORBIDDEN", 403)
  const provider = getPaymentProvider()
  const pricing = await db.pricingSettings.findUniqueOrThrow({
    where: { key: "default" },
  })
  const quote = calculatePrice(pricing, input)
  const currentSubscription = await db.subscription.findUnique({
    where: { userId: input.userId },
  })
  const now = new Date()
  await expireOverduePendingPayments({ now, userId: input.userId })
  if (
    currentSubscription?.status === "SUSPENDED" &&
    currentSubscription.expiresAt > now
  )
    throw new BusinessError("CONFLICT", 409)
  if (
    currentSubscription?.nextParametersAt &&
    currentSubscription.nextParametersAt > now &&
    ((currentSubscription.nextDeviceLimit ??
      currentSubscription.deviceLimit) !== input.deviceLimit ||
      (currentSubscription.nextLteEnabled ?? currentSubscription.lteEnabled) !==
        input.lteEnabled)
  )
    throw new BusinessError(
      "SUBSCRIPTION_UPGRADE_REQUIRES_PAYMENT",
      409,
      "A different plan is already scheduled for the next subscription period"
    )
  const key = input.idempotencyKey ?? randomUUID()
  const existing = await db.payment.findUnique({
    where: { idempotencyKey: key },
  })
  if (
    existing &&
    (existing.userId !== input.userId ||
      existing.amountMinor !== quote.amountMinor ||
      existing.durationDays !== quote.durationDays ||
      existing.deviceLimit !== quote.deviceLimit ||
      existing.lteEnabled !== quote.lteEnabled ||
      existing.pricingVersion !== quote.pricingVersion)
  ) {
    throw new BusinessError(
      "CONFLICT",
      409,
      "Payment idempotency key belongs to a different order"
    )
  }
  if (existing?.checkoutUrl) return existing
  if (existing)
    throw new BusinessError(
      "CONFLICT",
      409,
      "This checkout attempt cannot be safely repeated"
    )
  const openPayment = await db.payment.findFirst({
    where: {
      userId: input.userId,
      status: { in: ["CREATED", "PENDING"] },
    },
  })
  if (openPayment?.checkoutUrl) {
    if (
      openPayment.amountMinor === quote.amountMinor &&
      openPayment.durationDays === quote.durationDays &&
      openPayment.deviceLimit === quote.deviceLimit &&
      openPayment.lteEnabled === quote.lteEnabled
    )
      return openPayment
    throw new BusinessError(
      "CONFLICT",
      409,
      "A different checkout is already pending for this user"
    )
  }
  if (openPayment)
    throw new BusinessError(
      "CONFLICT",
      409,
      "A previous checkout is awaiting operator reconciliation"
    )
  let payment
  try {
    payment = await withBusyRetry(() =>
      db.payment.create({
        data: {
          userId: input.userId,
          provider: provider.name,
          idempotencyKey: key,
          status: "CREATED",
          amountMinor: quote.amountMinor,
          currency: "RUB",
          durationDays: quote.durationDays,
          deviceLimit: quote.deviceLimit,
          lteEnabled: quote.lteEnabled,
          basePriceMinor: quote.basePriceMinor,
          extraDevicesPriceMinor: quote.extraDevicesPriceMinor,
          ltePriceMinor: quote.ltePriceMinor,
          discountMinor: quote.discountMinor,
          priceSnapshotJson: quote.snapshotJson,
          pricingVersion: quote.pricingVersion,
          isTest: config.testMode,
        },
      })
    )
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      throw new BusinessError(
        "CONFLICT",
        409,
        "Another checkout is already in progress"
      )
    throw error
  }
  let checkout: Awaited<ReturnType<typeof provider.createCheckout>>
  try {
    checkout = await provider.createCheckout({
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      description: `Подписка Pulsar на ${payment.durationDays} дней`,
      returnUrl: `${getConfig().appUrl}/subscription?payment=success`,
      failedUrl: `${getConfig().appUrl}/subscription?payment=failed`,
      payload: payment.id,
      userId: input.userId,
    })
  } catch (error) {
    const definitelyRejected = error instanceof PaymentCheckoutRejectedError
    if (definitelyRejected)
      await withBusyRetry(() =>
        db.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED" },
        })
      )
    await db.integrationLog
      .create({
        data: {
          integration: provider.name,
          operation: definitelyRejected
            ? "CREATE_CHECKOUT_REJECTED"
            : "CREATE_CHECKOUT_UNCERTAIN",
          entityType: "Payment",
          entityId: payment.id,
          success: false,
          technicalError:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : String(error),
          correlationId: correlationId(),
        },
      })
      .catch(() => undefined)
    throw new BusinessError("INTEGRATION_TEMPORARILY_UNAVAILABLE", 503)
  }
  try {
    return await withBusyRetry(() =>
      db.$transaction(async (tx) => {
        const updated = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "PENDING",
            externalPaymentId: checkout.externalPaymentId,
            checkoutUrl: checkout.checkoutUrl,
            providerCreatedAt: checkout.providerCreatedAt,
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
        })
        await tx.outboxJob.create({
          data: {
            type: "RECONCILE_PAYMENT",
            aggregateType: "Payment",
            aggregateId: payment.id,
            payloadJson: JSON.stringify({
              paymentId: payment.id,
              pollAttempt: 1,
            }),
            dedupeKey: `payment:${payment.id}:reconcile:1`,
            runAfter: new Date(Date.now() + PAYMENT_RECONCILIATION_DELAY_MS),
            maxAttempts: 8,
          },
        })
        return updated
      })
    )
  } catch (error) {
    await db.integrationLog
      .create({
        data: {
          integration: provider.name,
          operation: "PERSIST_CHECKOUT",
          entityType: "Payment",
          entityId: payment.id,
          success: false,
          technicalError:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : String(error),
          correlationId: correlationId(),
        },
      })
      .catch(() => undefined)
    throw new BusinessError("INTEGRATION_TEMPORARILY_UNAVAILABLE", 503)
  }
}

export async function applyPaymentEvent(event: VerifiedPaymentEvent) {
  const outcome = await withBusyRetry(() =>
    db.$transaction(async (tx) => {
      const duplicate = await tx.paymentWebhookLog.findUnique({
        where: {
          provider_eventId: {
            provider: getPaymentProvider().name,
            eventId: event.eventId,
          },
        },
      })
      if (duplicate) return { duplicate: true, paymentId: duplicate.paymentId }
      let payment = await tx.payment.findUnique({
        where: { externalPaymentId: event.externalPaymentId },
      })
      const localPaymentId =
        event.payload && typeof event.payload === "object"
          ? (event.payload as { payload?: unknown }).payload
          : undefined
      if (!payment && typeof localPaymentId === "string") {
        const candidate = await tx.payment.findUnique({
          where: { id: localPaymentId },
        })
        if (
          candidate &&
          !candidate.externalPaymentId &&
          candidate.provider === getPaymentProvider().name &&
          candidate.amountMinor === event.amountMinor &&
          candidate.currency === event.currency &&
          ["CREATED", "PENDING"].includes(candidate.status)
        ) {
          payment = await tx.payment.update({
            where: { id: candidate.id },
            data: {
              externalPaymentId: event.externalPaymentId,
              providerCreatedAt: candidate.providerCreatedAt ?? new Date(),
            },
          })
        }
      }
      const log = await tx.paymentWebhookLog.create({
        data: {
          provider: getPaymentProvider().name,
          eventId: event.eventId,
          eventType: event.eventType,
          externalPaymentId: event.externalPaymentId,
          paymentId: payment?.id,
          signatureValid: true,
          payloadJson: JSON.stringify(event.payload),
        },
      })
      if (
        !payment ||
        payment.provider !== getPaymentProvider().name ||
        payment.amountMinor !== event.amountMinor ||
        payment.currency !== event.currency
      ) {
        await tx.paymentWebhookLog.update({
          where: { id: log.id },
          data: {
            processingError: "Payment reconciliation mismatch",
            processedAt: new Date(),
          },
        })
        return { reconciliationError: true as const }
      }
      if (event.status !== "CONFIRMED") {
        if (payment.status === "CONFIRMED" && event.status !== "REFUNDED") {
          await tx.paymentWebhookLog.update({
            where: { id: log.id },
            data: {
              processedAt: new Date(),
              processingError:
                "Ignored stale non-confirmed event after confirmation",
            },
          })
          return {
            duplicate: true,
            paymentId: payment.id,
            status: payment.status,
          }
        }
        if (payment.status === "EXPIRED" && event.status === "PENDING") {
          await tx.paymentWebhookLog.update({
            where: { id: log.id },
            data: {
              processedAt: new Date(),
              processingError: "Ignored stale pending event after expiration",
            },
          })
          return {
            duplicate: true,
            paymentId: payment.id,
            status: payment.status,
          }
        }
        const mapped =
          event.status === "REFUNDED"
            ? "REFUNDED"
            : event.status === "CANCELED"
              ? "CANCELED"
              : event.status === "FAILED"
                ? "FAILED"
                : "PENDING"
        if (mapped === "REFUNDED" && payment.status === "CONFIRMED") {
          const reward = await tx.referralReward.findUnique({
            where: { paymentId: payment.id },
          })
          if (reward?.status === "AVAILABLE") {
            const wallet = await tx.walletAccount.findUniqueOrThrow({
              where: { userId: reward.inviterUserId },
            })
            if (wallet.availableMinor >= reward.amountMinor) {
              await tx.walletAccount.update({
                where: { id: wallet.id },
                data: {
                  availableMinor: { decrement: reward.amountMinor },
                  version: { increment: 1 },
                },
              })
              await tx.walletLedgerEntry.create({
                data: {
                  walletAccountId: wallet.id,
                  userId: reward.inviterUserId,
                  type: "REFERRAL_REWARD_REVERSAL",
                  deltaAvailableMinor: -reward.amountMinor,
                  deltaReservedMinor: 0,
                  referenceType: "ReferralReward",
                  referenceId: reward.id,
                  idempotencyKey: `referral-reward:${reward.id}:reversal`,
                },
              })
              await tx.referralReward.update({
                where: { id: reward.id },
                data: { status: "REVERSED", reversedAt: new Date() },
              })
              await tx.referralInvite.update({
                where: { id: reward.inviteId },
                data: { status: "REWARD_REVERSED" },
              })
            } else {
              await tx.referralReward.update({
                where: { id: reward.id },
                data: { status: "MANUAL_REVIEW" },
              })
            }
          } else if (
            reward &&
            !["REVERSED", "MANUAL_REVIEW"].includes(reward.status)
          ) {
            await tx.referralReward.update({
              where: { id: reward.id },
              data: { status: "MANUAL_REVIEW" },
            })
          }
          const subscription = await tx.subscription.findUnique({
            where: { userId: payment.userId },
          })
          if (subscription) {
            await tx.subscriptionEvent.upsert({
              where: { idempotencyKey: `payment:${payment.id}:refund-review` },
              create: {
                subscriptionId: subscription.id,
                paymentId: payment.id,
                type: "REFUND_REVIEW_REQUIRED",
                previousStateJson: JSON.stringify(subscription),
                newStateJson: JSON.stringify(subscription),
                idempotencyKey: `payment:${payment.id}:refund-review`,
              },
              update: {},
            })
          }
          await tx.auditLog.create({
            data: {
              actorType: "SYSTEM",
              action: "PAYMENT_REFUNDED_REVIEW_REQUIRED",
              entityType: "Payment",
              entityId: payment.id,
              correlationId: correlationId(),
            },
          })
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: mapped,
            refundedAt: mapped === "REFUNDED" ? new Date() : undefined,
          },
        })
        await tx.paymentWebhookLog.update({
          where: { id: log.id },
          data: { processedAt: new Date() },
        })
        return { duplicate: false, paymentId: payment.id, status: mapped }
      }
      if (payment.status === "CONFIRMED") {
        await tx.paymentWebhookLog.update({
          where: { id: log.id },
          data: { processedAt: new Date() },
        })
        return { duplicate: true, paymentId: payment.id }
      }
      if (!["CREATED", "PENDING", "EXPIRED"].includes(payment.status)) {
        await tx.paymentWebhookLog.update({
          where: { id: log.id },
          data: {
            processedAt: new Date(),
            processingError: `Ignored invalid transition ${payment.status} -> CONFIRMED`,
          },
        })
        return {
          duplicate: true,
          paymentId: payment.id,
          status: payment.status,
        }
      }
      const now = new Date()
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "CONFIRMED", confirmedAt: now },
      })
      const current = await tx.subscription.findUnique({
        where: { userId: payment.userId },
      })
      const startsAt =
        current?.expiresAt && current.expiresAt > now ? current.expiresAt : now
      const expiresAt = new Date(
        startsAt.getTime() + payment.durationDays * 86_400_000
      )
      const syncVersion = (current?.syncVersion ?? 0) + 1
      const stagedBoundaryReached = Boolean(
        current?.nextParametersAt && current.nextParametersAt <= now
      )
      const currentDeviceLimit = stagedBoundaryReached
        ? (current?.nextDeviceLimit ??
          current?.deviceLimit ??
          payment.deviceLimit)
        : (current?.deviceLimit ?? payment.deviceLimit)
      const currentLteEnabled = stagedBoundaryReached
        ? (current?.nextLteEnabled ?? current?.lteEnabled ?? payment.lteEnabled)
        : (current?.lteEnabled ?? payment.lteEnabled)
      const hasActiveTerm = Boolean(
        current &&
        current.expiresAt > now &&
        ["ACTIVE", "TRIAL"].includes(current.status)
      )
      const hasFutureStagedParameters = Boolean(
        current?.nextParametersAt && current.nextParametersAt > now
      )
      if (
        hasFutureStagedParameters &&
        ((current?.nextDeviceLimit ?? currentDeviceLimit) !==
          payment.deviceLimit ||
          (current?.nextLteEnabled ?? currentLteEnabled) !== payment.lteEnabled)
      ) {
        await tx.subscriptionEvent.upsert({
          where: {
            idempotencyKey: `payment:${payment.id}:fulfillment-review`,
          },
          create: {
            subscriptionId: current!.id,
            paymentId: payment.id,
            type: "PAYMENT_FULFILLMENT_REVIEW_REQUIRED",
            previousStateJson: JSON.stringify(current),
            newStateJson: JSON.stringify(current),
            idempotencyKey: `payment:${payment.id}:fulfillment-review`,
          },
          update: {},
        })
        await tx.paymentWebhookLog.update({
          where: { id: log.id },
          data: {
            processedAt: now,
            processingError:
              "Payment confirmed; subscription fulfillment requires manual review",
          },
        })
        await tx.auditLog.create({
          data: {
            actorType: "SYSTEM",
            action: "PAYMENT_FULFILLMENT_REVIEW_REQUIRED",
            entityType: "Payment",
            entityId: payment.id,
            correlationId: correlationId(),
          },
        })
        return {
          duplicate: false,
          paymentId: payment.id,
          subscriptionId: current!.id,
          status: "CONFIRMED",
          fulfillmentReview: true,
        }
      }
      const scheduleParameters =
        hasActiveTerm &&
        !hasFutureStagedParameters &&
        (currentDeviceLimit !== payment.deviceLimit ||
          currentLteEnabled !== payment.lteEnabled)
      const nextDeviceLimit = hasFutureStagedParameters
        ? current!.nextDeviceLimit
        : scheduleParameters
          ? payment.deviceLimit
          : null
      const nextLteEnabled = hasFutureStagedParameters
        ? current!.nextLteEnabled
        : scheduleParameters
          ? payment.lteEnabled
          : null
      const nextParametersAt = hasFutureStagedParameters
        ? current!.nextParametersAt
        : scheduleParameters
          ? current!.expiresAt
          : null
      const subscription = current
        ? await tx.subscription.update({
            where: { id: current.id },
            data: {
              status: "ACTIVE",
              expiresAt,
              deviceLimit: hasActiveTerm
                ? currentDeviceLimit
                : payment.deviceLimit,
              lteEnabled: hasActiveTerm
                ? currentLteEnabled
                : payment.lteEnabled,
              nextDeviceLimit,
              nextLteEnabled,
              nextParametersAt,
              syncStatus: "PENDING",
              syncVersion,
              lastTechnicalError: null,
              lastUserFriendlyError: null,
            },
          })
        : await tx.subscription.create({
            data: {
              userId: payment.userId,
              status: "ACTIVE",
              startedAt: now,
              expiresAt,
              deviceLimit: payment.deviceLimit,
              lteEnabled: payment.lteEnabled,
              syncStatus: "PENDING",
              syncVersion,
            },
          })
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: current ? "PAYMENT_EXTENDED" : "PAYMENT_ACTIVATED",
          paymentId: payment.id,
          previousStateJson: current ? JSON.stringify(current) : null,
          newStateJson: JSON.stringify(subscription),
          idempotencyKey: `payment:${payment.id}:subscription`,
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
      await tx.outboxJob.create({
        data: {
          type: "SEND_TELEGRAM_NOTIFICATION",
          aggregateType: "Payment",
          aggregateId: payment.id,
          payloadJson: JSON.stringify({
            userId: payment.userId,
            template: "PAYMENT_CONFIRMED",
          }),
          dedupeKey: `telegram:payment-confirmed:${payment.id}`,
          maxAttempts: 5,
        },
      })
      await grantReferralReward(tx, {
        invitedUserId: payment.userId,
        paymentId: payment.id,
      })
      await tx.referralProfile.update({
        where: { userId: payment.userId },
        data: { isEnabled: true, enabledAt: now },
      })
      await tx.paymentWebhookLog.update({
        where: { id: log.id },
        data: { processedAt: now },
      })
      await tx.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "PAYMENT_CONFIRMED",
          entityType: "Payment",
          entityId: payment.id,
          correlationId: correlationId(),
        },
      })
      return {
        duplicate: false,
        paymentId: payment.id,
        subscriptionId: subscription.id,
        status: "CONFIRMED",
      }
    })
  )
  if ("reconciliationError" in outcome)
    throw new BusinessError("CONFLICT", 409, "Payment reconciliation mismatch")
  return outcome
}

export async function reconcilePaymentStatus(paymentId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.status !== "PENDING" || !payment.externalPaymentId)
    return { status: payment?.status ?? "NOT_FOUND", terminal: true }
  const provider = getPaymentProvider()
  if (payment.provider !== provider.name)
    throw new Error(
      `Payment provider mismatch: stored=${payment.provider}, configured=${provider.name}`
    )
  try {
    const snapshot = await provider.getPaymentStatus(payment.externalPaymentId)
    await db.integrationLog.create({
      data: {
        integration: provider.name,
        operation: "GET_PAYMENT_STATUS",
        entityType: "Payment",
        entityId: payment.id,
        success: true,
        responseSummary: JSON.stringify({ status: snapshot.status }),
        correlationId: correlationId(),
      },
    })
    if (snapshot.status === "PENDING")
      return { status: snapshot.status, terminal: false }
    if (
      typeof snapshot.amountMinor !== "number" ||
      !Number.isSafeInteger(snapshot.amountMinor) ||
      !snapshot.currency
    )
      throw new Error("Provider status lacks verified amount or currency")
    await applyPaymentEvent({
      eventId: stableEventId(
        `reconcile:${provider.name}:${snapshot.externalPaymentId}:${snapshot.status}:${snapshot.amountMinor}:${snapshot.currency}`
      ),
      eventType: `RECONCILE_${snapshot.status}`,
      externalPaymentId: snapshot.externalPaymentId,
      status: snapshot.status,
      amountMinor: snapshot.amountMinor,
      currency: snapshot.currency,
      payload: snapshot.payload,
    })
    return { status: snapshot.status, terminal: true }
  } catch (error) {
    await db.integrationLog.create({
      data: {
        integration: provider.name,
        operation: "GET_PAYMENT_STATUS",
        entityType: "Payment",
        entityId: payment.id,
        success: false,
        technicalError:
          error instanceof Error ? error.message.slice(0, 1000) : String(error),
        correlationId: correlationId(),
      },
    })
    throw error
  }
}
