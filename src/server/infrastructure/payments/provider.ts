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
      `${getConfig().payments.plategaBaseUrl}/v2/transaction/process`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
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
      url?: string
    }
    if (!body.transactionId || !body.url)
      throw new Error("Platega create checkout response is incomplete")
    return {
      externalPaymentId: body.transactionId,
      checkoutUrl: body.url,
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
}

export function getPaymentProvider(): PaymentProvider {
  return getConfig().payments.provider === "platega"
    ? new PlategaPaymentProvider()
    : new TestPaymentProvider()
}
