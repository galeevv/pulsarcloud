import { randomUUID } from "node:crypto"
import type { Payment } from "@/src/generated/prisma/client"
import { db, withBusyRetry } from "@/src/server/infrastructure/db/client"
import { getConfig } from "@/src/server/config"
import {
  calculatePrice,
  durationDays,
} from "@/src/server/domain/billing/pricing"
import {
  getPaymentProvider,
  PaymentCheckoutRejectedError,
  type PaymentProvider,
  type VerifiedPaymentEvent,
} from "@/src/server/infrastructure/payments/provider"
import { BusinessError } from "@/src/server/application/errors"
import { grantReferralReward } from "@/src/server/domain/referrals/service"
import {
  correlationId,
  stableEventId,
} from "@/src/server/infrastructure/security/crypto"

const PAYMENT_RECONCILIATION_DELAY_MS = 60_000

function planDurationMonthsFromDays(value: number) {
  for (const [months, days] of Object.entries(durationDays))
    if (days === value) return Number(months)
  return null
}

export type CheckoutPaymentMethod = "SBP" | "WALLET"
export type CheckoutSelection = {
  userId: string
  durationMonths: number
  deviceLimit: number
  lteEnabled: boolean
}

export type DeviceLimitUpgradeSelection = {
  userId: string
  targetDeviceLimit: number
}

async function loadCheckoutQuote(input: CheckoutSelection) {
  const pricing = await db.pricingSettings.findUniqueOrThrow({
    where: { key: "default" },
  })
  return {
    pricing,
    quote: calculatePrice(pricing, input),
  }
}

async function loadDeviceLimitUpgradeQuote(
  input: DeviceLimitUpgradeSelection,
  now = new Date()
) {
  const [pricing, subscription] = await Promise.all([
    db.pricingSettings.findUniqueOrThrow({ where: { key: "default" } }),
    db.subscription.findUnique({ where: { userId: input.userId } }),
  ])
  const maximumDeviceLimit = Math.min(pricing.maxDeviceLimit, 5)

  if (
    !subscription ||
    !["ACTIVE", "TRIAL"].includes(subscription.status) ||
    subscription.expiresAt <= now ||
    subscription.syncStatus !== "SYNCED" ||
    !subscription.remnawaveUserId
  )
    throw new BusinessError("SUBSCRIPTION_NOT_FOUND", 404)
  if (
    !Number.isInteger(input.targetDeviceLimit) ||
    input.targetDeviceLimit <= subscription.deviceLimit ||
    input.targetDeviceLimit > maximumDeviceLimit
  )
    throw new BusinessError("INVALID_INPUT", 400)

  const addedDevices = input.targetDeviceLimit - subscription.deviceLimit
  return {
    pricing,
    subscription,
    maximumDeviceLimit,
    addedDevices,
    amountMinor: addedDevices * pricing.deviceLimitUpgradePriceMinor,
  }
}

export async function getCheckoutExpectation(input: CheckoutSelection) {
  const { pricing, quote } = await loadCheckoutQuote(input)
  return {
    expectedAmountMinor: quote.amountMinor,
    pricingVersion: pricing.version,
  }
}

export async function getDeviceLimitUpgradeExpectation(
  input: DeviceLimitUpgradeSelection
) {
  const quote = await loadDeviceLimitUpgradeQuote(input)
  return {
    expectedAmountMinor: quote.amountMinor,
    pricingVersion: quote.pricing.version,
  }
}

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

async function confirmWalletPayment(payment: Payment) {
  if (payment.provider !== "wallet" || !payment.externalPaymentId)
    throw new Error("Wallet payment is incomplete")
  try {
    await applyPaymentEvent(
      {
        eventId: `wallet:${payment.id}:confirmed`,
        eventType: "CONFIRMED",
        externalPaymentId: payment.externalPaymentId,
        status: "CONFIRMED",
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        payload: { payload: payment.id, paymentMethod: "WALLET" },
      },
      { providerName: "wallet", debitWallet: true }
    )
  } catch (error) {
    if (
      error instanceof BusinessError &&
      error.code === "WALLET_INSUFFICIENT_BALANCE"
    )
      await withBusyRetry(() =>
        db.payment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { status: "FAILED" },
        })
      )
    throw error
  }
  return db.payment.findUniqueOrThrow({ where: { id: payment.id } })
}

async function createProviderCheckout(
  payment: Payment,
  provider: PaymentProvider,
  description: string
) {
  let checkout: Awaited<ReturnType<typeof provider.createCheckout>>
  try {
    checkout = await provider.createCheckout({
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      description,
      returnUrl: `${getConfig().appUrl}/subscription?payment=success`,
      failedUrl: `${getConfig().appUrl}/subscription?payment=failed`,
      payload: payment.id,
      userId: payment.userId,
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

export async function createCheckout(
  input: CheckoutSelection & {
    paymentMethod?: CheckoutPaymentMethod
    expectedAmountMinor: number
    pricingVersion: number
    idempotencyKey?: string
  }
) {
  const config = getConfig()
  if (!config.testMode && !config.payments.enabled)
    throw new BusinessError("BILLING_DISABLED", 503)
  const user = await db.user.findUnique({ where: { id: input.userId } })
  if (!user || user.status !== "ACTIVE" || user.isTest !== config.testMode)
    throw new BusinessError("AUTH_FORBIDDEN", 403)
  const paymentMethod = input.paymentMethod ?? "SBP"
  const providerName =
    paymentMethod === "WALLET" ? "wallet" : config.payments.provider
  const now = new Date()
  await expireOverduePendingPayments({ now, userId: input.userId })
  const key = input.idempotencyKey ?? randomUUID()
  const existing = await db.payment.findUnique({
    where: { idempotencyKey: key },
  })
  if (
    existing &&
    (existing.userId !== input.userId ||
      existing.purpose !== "SUBSCRIPTION" ||
      existing.amountMinor !== input.expectedAmountMinor ||
      existing.provider !== providerName ||
      existing.durationDays !==
        durationDays[input.durationMonths as keyof typeof durationDays] ||
      existing.deviceLimit !== input.deviceLimit ||
      existing.lteEnabled !== input.lteEnabled ||
      existing.pricingVersion !== input.pricingVersion)
  ) {
    throw new BusinessError(
      "CONFLICT",
      409,
      "Payment idempotency key belongs to a different order"
    )
  }
  if (
    existing?.provider === "wallet" &&
    existing.status === "PENDING" &&
    existing.checkoutUrl
  )
    return confirmWalletPayment(existing)
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
      openPayment.purpose === "SUBSCRIPTION" &&
      openPayment.amountMinor === input.expectedAmountMinor &&
      openPayment.durationDays ===
        durationDays[input.durationMonths as keyof typeof durationDays] &&
      openPayment.deviceLimit === input.deviceLimit &&
      openPayment.lteEnabled === input.lteEnabled &&
      openPayment.pricingVersion === input.pricingVersion &&
      openPayment.provider === providerName
    )
      return openPayment.provider === "wallet"
        ? confirmWalletPayment(openPayment)
        : openPayment
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
  const { pricing, quote } = await loadCheckoutQuote(input)
  if (
    input.pricingVersion !== pricing.version ||
    input.expectedAmountMinor !== quote.amountMinor
  )
    throw new BusinessError("PAYMENT_PRICE_CHANGED", 409)
  const provider = paymentMethod === "SBP" ? getPaymentProvider() : null
  const currentSubscription = await db.subscription.findUnique({
    where: { userId: input.userId },
  })
  if (
    currentSubscription?.status === "SUSPENDED" &&
    currentSubscription.expiresAt > now
  )
    throw new BusinessError("CONFLICT", 409)
  let payment
  try {
    payment = await withBusyRetry(() =>
      db.payment.create({
        data: {
          userId: input.userId,
          provider: providerName,
          idempotencyKey: key,
          status: "CREATED",
          purpose: "SUBSCRIPTION",
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
  if (paymentMethod === "WALLET") {
    const externalPaymentId = `wallet_${payment.id}`
    const checkoutUrl = `${config.appUrl}/subscription?payment=success`
    await withBusyRetry(() =>
      db.payment.update({
        where: { id: payment.id },
        data: {
          status: "PENDING",
          externalPaymentId,
          checkoutUrl,
          providerCreatedAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      })
    )
    return confirmWalletPayment(
      await db.payment.findUniqueOrThrow({ where: { id: payment.id } })
    )
  }
  if (!provider) throw new Error("SBP payment provider is unavailable")
  return createProviderCheckout(
    payment,
    provider,
    `Подписка Pulsar на ${payment.durationDays} дней`
  )
}

export async function createDeviceLimitUpgradeCheckout(
  input: DeviceLimitUpgradeSelection & {
    expectedAmountMinor: number
    pricingVersion: number
    idempotencyKey?: string
  }
) {
  const config = getConfig()
  if (!config.testMode && !config.payments.enabled)
    throw new BusinessError("BILLING_DISABLED", 503)

  const user = await db.user.findUnique({ where: { id: input.userId } })
  if (!user || user.status !== "ACTIVE" || user.isTest !== config.testMode)
    throw new BusinessError("AUTH_FORBIDDEN", 403)

  const now = new Date()
  await expireOverduePendingPayments({ now, userId: input.userId })
  const provider = getPaymentProvider()
  const key = input.idempotencyKey ?? randomUUID()
  const existing = await db.payment.findUnique({
    where: { idempotencyKey: key },
  })

  if (
    existing &&
    (existing.userId !== input.userId ||
      existing.purpose !== "DEVICE_LIMIT_UPGRADE" ||
      existing.amountMinor !== input.expectedAmountMinor ||
      existing.provider !== provider.name ||
      existing.deviceLimit !== input.targetDeviceLimit ||
      existing.pricingVersion !== input.pricingVersion)
  )
    throw new BusinessError(
      "CONFLICT",
      409,
      "Payment idempotency key belongs to a different order"
    )
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
      openPayment.purpose === "DEVICE_LIMIT_UPGRADE" &&
      openPayment.amountMinor === input.expectedAmountMinor &&
      openPayment.deviceLimit === input.targetDeviceLimit &&
      openPayment.pricingVersion === input.pricingVersion &&
      openPayment.provider === provider.name
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

  const quote = await loadDeviceLimitUpgradeQuote(input, now)
  if (
    input.pricingVersion !== quote.pricing.version ||
    input.expectedAmountMinor !== quote.amountMinor
  )
    throw new BusinessError("PAYMENT_PRICE_CHANGED", 409)

  let payment
  try {
    payment = await withBusyRetry(() =>
      db.payment.create({
        data: {
          userId: input.userId,
          provider: provider.name,
          idempotencyKey: key,
          status: "CREATED",
          purpose: "DEVICE_LIMIT_UPGRADE",
          amountMinor: quote.amountMinor,
          currency: "RUB",
          durationDays: 0,
          deviceLimit: input.targetDeviceLimit,
          lteEnabled: quote.subscription.lteEnabled,
          basePriceMinor: 0,
          extraDevicesPriceMinor: quote.amountMinor,
          ltePriceMinor: 0,
          discountMinor: 0,
          priceSnapshotJson: JSON.stringify({
            purpose: "DEVICE_LIMIT_UPGRADE",
            previousDeviceLimit: quote.subscription.deviceLimit,
            targetDeviceLimit: input.targetDeviceLimit,
            addedDevices: quote.addedDevices,
            unitPriceMinor: quote.pricing.deviceLimitUpgradePriceMinor,
            amountMinor: quote.amountMinor,
            pricingVersion: quote.pricing.version,
          }),
          pricingVersion: quote.pricing.version,
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

  return createProviderCheckout(
    payment,
    provider,
    `Дополнительные устройства Pulsar: +${quote.addedDevices}`
  )
}

export async function applyPaymentEvent(
  event: VerifiedPaymentEvent,
  options?: { providerName?: string; debitWallet?: boolean }
) {
  const providerName = options?.providerName ?? getPaymentProvider().name
  const outcome = await withBusyRetry(() =>
    db.$transaction(async (tx) => {
      const duplicate = await tx.paymentWebhookLog.findUnique({
        where: {
          provider_eventId: {
            provider: providerName,
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
          candidate.provider === providerName &&
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
          provider: providerName,
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
        payment.provider !== providerName ||
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
      if (options?.debitWallet) {
        const debited = await tx.walletAccount.updateMany({
          where: {
            userId: payment.userId,
            availableMinor: { gte: payment.amountMinor },
          },
          data: {
            availableMinor: { decrement: payment.amountMinor },
            version: { increment: 1 },
          },
        })
        if (debited.count !== 1)
          throw new BusinessError("WALLET_INSUFFICIENT_BALANCE", 409)
        const wallet = await tx.walletAccount.findUniqueOrThrow({
          where: { userId: payment.userId },
        })
        await tx.walletLedgerEntry.create({
          data: {
            walletAccountId: wallet.id,
            userId: payment.userId,
            type: "SUBSCRIPTION_PAYMENT",
            deltaAvailableMinor: -payment.amountMinor,
            deltaReservedMinor: 0,
            referenceType: "Payment",
            referenceId: payment.id,
            idempotencyKey: `wallet-subscription:${payment.id}`,
            description: "Оплата подписки Pulsar",
          },
        })
      }
      const now = new Date()
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "CONFIRMED", confirmedAt: now },
      })
      const current = await tx.subscription.findUnique({
        where: { userId: payment.userId },
      })
      if (payment.purpose === "DEVICE_LIMIT_UPGRADE") {
        if (
          !current ||
          !["ACTIVE", "TRIAL"].includes(current.status) ||
          current.expiresAt <= now
        ) {
          await tx.paymentWebhookLog.update({
            where: { id: log.id },
            data: {
              processedAt: now,
              processingError:
                "Device limit upgrade requires manual fulfillment review",
            },
          })
          await tx.auditLog.create({
            data: {
              actorType: "SYSTEM",
              action: "DEVICE_LIMIT_UPGRADE_FULFILLMENT_REVIEW_REQUIRED",
              entityType: "Payment",
              entityId: payment.id,
              correlationId: correlationId(),
            },
          })
          return {
            duplicate: false,
            paymentId: payment.id,
            status: "CONFIRMED",
            fulfillmentReview: true,
          }
        }

        const targetDeviceLimit = Math.max(
          current.deviceLimit,
          payment.deviceLimit
        )
        const syncVersion = current.syncVersion + 1
        const subscription = await tx.subscription.update({
          where: { id: current.id },
          data: {
            deviceLimit: targetDeviceLimit,
            nextDeviceLimit:
              current.nextDeviceLimit === null
                ? null
                : Math.max(current.nextDeviceLimit, targetDeviceLimit),
            syncStatus: "PENDING",
            syncVersion,
            lastTechnicalError: null,
            lastUserFriendlyError: null,
          },
        })
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: subscription.id,
            type: "DEVICE_LIMIT_UPGRADED",
            paymentId: payment.id,
            previousStateJson: JSON.stringify(current),
            newStateJson: JSON.stringify(subscription),
            idempotencyKey: `payment:${payment.id}:device-limit`,
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
        await tx.paymentWebhookLog.update({
          where: { id: log.id },
          data: { processedAt: now },
        })
        await tx.auditLog.create({
          data: {
            actorType: "SYSTEM",
            action: "DEVICE_LIMIT_UPGRADED",
            entityType: "Subscription",
            entityId: subscription.id,
            correlationId: correlationId(),
          },
        })
        return {
          duplicate: false,
          paymentId: payment.id,
          subscriptionId: subscription.id,
          status: "CONFIRMED",
        }
      }
      const startsAt =
        current?.expiresAt && current.expiresAt > now ? current.expiresAt : now
      const expiresAt = new Date(
        startsAt.getTime() + payment.durationDays * 86_400_000
      )
      const syncVersion = (current?.syncVersion ?? 0) + 1
      const planDurationMonths = planDurationMonthsFromDays(
        payment.durationDays
      )
      const subscription = current
        ? await tx.subscription.update({
            where: { id: current.id },
            data: {
              status: "ACTIVE",
              expiresAt,
              deviceLimit: payment.deviceLimit,
              lteEnabled: payment.lteEnabled,
              planDurationMonths,
              nextDeviceLimit: null,
              nextLteEnabled: null,
              nextParametersAt: null,
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
              planDurationMonths,
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
