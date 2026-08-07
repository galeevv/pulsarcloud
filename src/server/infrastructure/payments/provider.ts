import { randomUUID } from "node:crypto"
import { getConfig } from "@/src/server/config"
import {
  safeEqual,
  stableEventId,
} from "@/src/server/infrastructure/security/crypto"

export type ProviderPaymentStatus =
  "PENDING" | "CONFIRMED" | "FAILED" | "CANCELED" | "REFUNDED"
export type VerifiedPaymentEvent = {
  eventId: string
  eventType: string
  externalPaymentId: string
  status: ProviderPaymentStatus
  amountMinor: number
  currency: string
  payload: unknown
}
export type ProviderPaymentSnapshot = {
  externalPaymentId: string
  status: ProviderPaymentStatus
  amountMinor?: number
  currency?: string
  payload: unknown
}
export class PaymentWebhookVerificationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 = 400
  ) {
    super(message)
    this.name = "PaymentWebhookVerificationError"
  }
}
export class PaymentCheckoutRejectedError extends Error {
  constructor(readonly providerStatus: number) {
    super(`Payment provider rejected checkout with HTTP ${providerStatus}`)
    this.name = "PaymentCheckoutRejectedError"
  }
}

function isPaymentStatus(value: unknown): value is ProviderPaymentStatus {
  return ["PENDING", "CONFIRMED", "FAILED", "CANCELED", "REFUNDED"].includes(
    String(value)
  )
}
export interface PaymentProvider {
  readonly name: string
  createCheckout(input: {
    amountMinor: number
    currency: string
    description: string
    returnUrl: string
    failedUrl: string
    payload: string
    userId: string
  }): Promise<{
    externalPaymentId: string
    checkoutUrl: string
    providerCreatedAt?: Date
  }>
  verifyWebhook(request: Request): Promise<VerifiedPaymentEvent>
  getPaymentStatus(externalPaymentId: string): Promise<ProviderPaymentSnapshot>
  /**
   * Best-effort void of an invoice the customer abandoned. Implementations must
   * refuse rather than throw when the provider would charge for the
   * cancellation, and callers must treat a rejection as non-fatal.
   */
  cancelCheckout(
    externalPaymentId: string
  ): Promise<{ accepted: boolean; reason?: string }>
}

class TestPaymentProvider implements PaymentProvider {
  readonly name = "test"
  async createCheckout() {
    const externalPaymentId = `test_${randomUUID()}`
    return {
      externalPaymentId,
      checkoutUrl: `${getConfig().appUrl}/test/checkout/${externalPaymentId}`,
      providerCreatedAt: new Date(),
    }
  }
  async verifyWebhook(request: Request) {
    const secret = request.headers.get("x-pulsar-test-secret") ?? ""
    const expected = getConfig().payments.webhookSecret
    if (!expected || !safeEqual(secret, expected))
      throw new PaymentWebhookVerificationError(
        "Invalid test payment signature",
        401
      )
    const payload = (await request.json()) as {
      id: string
      status: ProviderPaymentStatus
      amountMinor: number
      currency: string
      eventId?: string
    }
    if (
      typeof payload.id !== "string" ||
      !payload.id ||
      !isPaymentStatus(payload.status) ||
      !Number.isSafeInteger(payload.amountMinor) ||
      payload.amountMinor <= 0 ||
      !/^[A-Z]{3}$/.test(payload.currency)
    )
      throw new PaymentWebhookVerificationError("Invalid test payment payload")
    return {
      eventId: payload.eventId ?? stableEventId(JSON.stringify(payload)),
      eventType: payload.status,
      externalPaymentId: payload.id,
      status: payload.status,
      amountMinor: payload.amountMinor,
      currency: payload.currency,
      payload,
    }
  }
  async getPaymentStatus(externalPaymentId: string) {
    return {
      externalPaymentId,
      status: "PENDING" as const,
      payload: { id: externalPaymentId, status: "PENDING" },
    }
  }
  async cancelCheckout(externalPaymentId: string) {
    void externalPaymentId
    return { accepted: true }
  }
}

class PlategaPaymentProvider implements PaymentProvider {
  readonly name = "platega"
  private headers() {
    const { plategaMerchantId, plategaSecret } = getConfig().payments
    if (!plategaMerchantId || !plategaSecret)
      throw new Error("Platega credentials are missing")
    return {
      "Content-Type": "application/json",
      "X-MerchantId": plategaMerchantId,
      "X-Secret": plategaSecret,
    }
  }
  async createCheckout(input: {
    amountMinor: number
    currency: string
    description: string
    returnUrl: string
    failedUrl: string
    payload: string
    userId: string
  }) {
    const response = await fetch(
      `${getConfig().payments.plategaBaseUrl}/transaction/process`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          paymentMethod: 2,
          paymentDetails: {
            amount: input.amountMinor / 100,
            currency: input.currency,
          },
          description: input.description,
          return: input.returnUrl,
          failedUrl: input.failedUrl,
          payload: input.payload,
          metadata: { userId: input.userId },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500)
        throw new PaymentCheckoutRejectedError(response.status)
      throw new Error(
        `Platega create checkout failed with HTTP ${response.status}`
      )
    }
    const body = (await response.json()) as {
      transactionId?: string
      redirect?: string
    }
    if (!body.transactionId || !body.redirect)
      throw new Error("Platega create checkout response is incomplete")
    return {
      externalPaymentId: body.transactionId,
      checkoutUrl: body.redirect,
      providerCreatedAt: new Date(),
    }
  }
  async verifyWebhook(request: Request) {
    const merchant = request.headers.get("x-merchantid") ?? ""
    const secret = request.headers.get("x-secret") ?? ""
    const config = getConfig().payments
    if (
      !config.plategaMerchantId ||
      !config.plategaSecret ||
      !safeEqual(merchant, config.plategaMerchantId) ||
      !safeEqual(secret, config.plategaSecret)
    )
      throw new PaymentWebhookVerificationError(
        "Invalid Platega callback credentials",
        401
      )
    const payload = (await request.json()) as {
      id: string
      amount: number
      currency: string
      status: string
      paymentMethod?: number
      payload?: string
    }
    const statuses: Record<string, ProviderPaymentStatus> = {
      CONFIRMED: "CONFIRMED",
      CANCELED: "CANCELED",
      CHARGEBACKED: "REFUNDED",
      PENDING: "PENDING",
    }
    const status = statuses[payload.status]
    if (
      typeof payload.id !== "string" ||
      !payload.id ||
      payload.id.length > 200 ||
      !status ||
      !Number.isFinite(payload.amount) ||
      payload.amount <= 0 ||
      !/^[A-Z]{3}$/.test(payload.currency)
    )
      throw new PaymentWebhookVerificationError(
        "Invalid Platega callback payload"
      )
    return {
      eventId: stableEventId(
        `${payload.id}:${payload.status}:${payload.amount}:${payload.currency}`
      ),
      eventType: payload.status,
      externalPaymentId: payload.id,
      status,
      amountMinor: Math.round(payload.amount * 100),
      currency: payload.currency,
      payload,
    }
  }
  async getPaymentStatus(externalPaymentId: string) {
    const response = await fetch(
      `${getConfig().payments.plategaBaseUrl}/transaction/${encodeURIComponent(externalPaymentId)}`,
      { headers: this.headers(), signal: AbortSignal.timeout(10_000) }
    )
    if (!response.ok)
      throw new Error(`Platega status failed with HTTP ${response.status}`)
    const body = (await response.json()) as {
      id?: string
      status?: string
      paymentDetails?: { amount?: number; currency?: string }
    }
    if (body.id && body.id !== externalPaymentId)
      throw new Error("Platega status response transaction ID mismatch")
    const status =
      (
        {
          CONFIRMED: "CONFIRMED",
          CANCELED: "CANCELED",
          CHARGEBACKED: "REFUNDED",
          PENDING: "PENDING",
          EXPIRED: "FAILED",
          FAILED: "FAILED",
        } as Record<string, ProviderPaymentStatus>
      )[body.status ?? ""] ?? "FAILED"
    const amount = body.paymentDetails?.amount
    const currency = body.paymentDetails?.currency
    if (status !== "PENDING" && (!Number.isFinite(amount) || !currency))
      throw new Error("Platega status response payment details are incomplete")
    return {
      externalPaymentId,
      status,
      amountMinor: Number.isFinite(amount)
        ? Math.round(Number(amount) * 100)
        : undefined,
      currency,
      payload: body,
    }
  }
  async cancelCheckout(externalPaymentId: string) {
    const base = `${getConfig().payments.plategaBaseUrl}/transaction/${encodeURIComponent(externalPaymentId)}`
    // Short timeouts: a customer waiting on a new invoice must not be held up
    // by housekeeping on the one they abandoned.
    const eligibility = await fetch(`${base}/cancel-supported`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(5_000),
    })
    if (!eligibility.ok)
      return {
        accepted: false,
        reason: `cancel-supported returned HTTP ${eligibility.status}`,
      }
    const quote = (await eligibility.json()) as {
      supported?: boolean
      penaltyUsdt?: number
      totalDeductUsdt?: number
      blockReason?: string
    }
    // Platega can settle a cancellation against the merchant balance. An
    // abandoned invoice must never cost us money, so only free voids proceed.
    if (!quote.supported)
      return { accepted: false, reason: quote.blockReason ?? "not supported" }
    if ((quote.penaltyUsdt ?? 0) > 0 || (quote.totalDeductUsdt ?? 0) > 0)
      return { accepted: false, reason: "cancellation is not free" }

    const response = await fetch(`${base}/cancel`, {
      method: "POST",
      headers: this.headers(),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok)
      return {
        accepted: false,
        reason: `cancel returned HTTP ${response.status}`,
      }
    const body = (await response.json()) as {
      accepted?: boolean
      message?: string
    }
    return { accepted: Boolean(body.accepted), reason: body.message }
  }
}

export function getPaymentProvider(): PaymentProvider {
  return getConfig().payments.provider === "platega"
    ? new PlategaPaymentProvider()
    : new TestPaymentProvider()
}
