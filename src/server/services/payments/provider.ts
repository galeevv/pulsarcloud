import { createHmac } from "node:crypto"

import { PaymentProvider as PaymentProviderType } from "@/generated/prisma/client"
import { z } from "zod"

import {
  IntegrationError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/application-errors"
import { timingSafeStringEqual } from "@/lib/security"

export type CreatePaymentInput = {
  paymentId: string
  userId: string
  amountRub: number
  currency: "RUB"
  description: string
  idempotencyKey: string
}

export type CreatedPayment = {
  providerPaymentId: string
  checkoutUrl: string
}

export type ProviderPaymentEventType =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"

export type VerifiedPaymentWebhook = {
  providerEventId: string
  providerPaymentId: string
  eventType: ProviderPaymentEventType
  amountRub: number
  refundedAmountRub?: number
  currency: "RUB"
  payload: Record<string, unknown>
}

export type VerifyWebhookInput = {
  rawBody: string
  headers: Headers
}

export interface PaymentProviderAdapter {
  readonly type: PaymentProviderType
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>
  verifyWebhook(input: VerifyWebhookInput): Promise<VerifiedPaymentWebhook>
}

const mockWebhookSchema = z.object({
  eventId: z.string().min(1).max(200),
  providerPaymentId: z.string().min(1).max(200),
  status: z.enum([
    "PENDING",
    "SUCCEEDED",
    "FAILED",
    "CANCELED",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
  ]),
  amountRub: z.number().int().nonnegative(),
  refundedAmountRub: z.number().int().positive().optional(),
  currency: z.literal("RUB"),
})

export class MockPaymentProvider implements PaymentProviderAdapter {
  readonly type = PaymentProviderType.MOCK

  async createPayment(input: CreatePaymentInput) {
    return {
      providerPaymentId: `mock-${input.paymentId}`,
      checkoutUrl: `mock://payment/${input.paymentId}`,
    }
  }

  async verifyWebhook({ rawBody, headers }: VerifyWebhookInput) {
    const signature = headers.get("x-mock-signature")

    if (
      !signature ||
      !timingSafeStringEqual(signature, createMockWebhookSignature(rawBody))
    ) {
      throw new UnauthorizedError("Invalid mock payment webhook signature.")
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch (error) {
      throw new ValidationError(
        "Payment webhook body is not valid JSON.",
        {},
        {
          cause: error,
        }
      )
    }

    const parsed = mockWebhookSchema.safeParse(payload)
    if (!parsed.success) {
      throw new ValidationError("Invalid mock payment webhook payload.", {
        issues: parsed.error.issues,
      })
    }

    return {
      providerEventId: parsed.data.eventId,
      providerPaymentId: parsed.data.providerPaymentId,
      eventType: parsed.data.status,
      amountRub: parsed.data.amountRub,
      refundedAmountRub: parsed.data.refundedAmountRub,
      currency: parsed.data.currency,
      payload: parsed.data,
    }
  }
}

const plategaCreateResponseSchema = z.object({
  transactionId: z.string().uuid(),
  redirect: z.string().url(),
})

const plategaWebhookSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().int().nonnegative(),
  currency: z.literal("RUB"),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELED", "CHARGEBACKED"]),
  paymentMethod: z.literal(2),
})

export class PlategaPaymentProvider implements PaymentProviderAdapter {
  readonly type = PaymentProviderType.PLATEGA

  async createPayment(input: CreatePaymentInput) {
    const response = await fetch(
      new URL("/transaction/process", getPlategaApiUrl()),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-merchantid": getRequiredEnv("PLATEGA_MERCHANT_ID"),
          "x-secret": getRequiredEnv("PLATEGA_SECRET"),
        },
        body: JSON.stringify({
          paymentMethod: 2,
          paymentDetails: { amount: input.amountRub, currency: input.currency },
          description: input.description,
          return: `${getAppUrl()}/subscription?payment=success`,
          failedUrl: `${getAppUrl()}/subscription?payment=failed`,
          payload: input.paymentId,
          metadata: { userId: input.userId },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )

    if (!response.ok) {
      throw new IntegrationError("Platega rejected payment creation.", {
        status: response.status,
      })
    }

    const parsed = plategaCreateResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      throw new IntegrationError(
        "Platega returned an invalid payment response."
      )
    }

    return {
      providerPaymentId: parsed.data.transactionId,
      checkoutUrl: parsed.data.redirect,
    }
  }

  async verifyWebhook({ rawBody, headers }: VerifyWebhookInput) {
    const merchantId = headers.get("x-merchantid")
    const secret = headers.get("x-secret")

    if (
      !merchantId ||
      !secret ||
      !timingSafeStringEqual(
        merchantId,
        getRequiredEnv("PLATEGA_MERCHANT_ID")
      ) ||
      !timingSafeStringEqual(secret, getRequiredEnv("PLATEGA_SECRET"))
    ) {
      throw new UnauthorizedError("Invalid Platega callback credentials.")
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch (error) {
      throw new ValidationError(
        "Platega callback body is not valid JSON.",
        {},
        {
          cause: error,
        }
      )
    }

    const parsed = plategaWebhookSchema.safeParse(payload)
    if (!parsed.success) {
      throw new ValidationError("Invalid Platega callback payload.", {
        issues: parsed.error.issues,
      })
    }

    const eventType = {
      PENDING: "PENDING",
      CONFIRMED: "SUCCEEDED",
      CANCELED: "CANCELED",
      CHARGEBACKED: "REFUNDED",
    }[parsed.data.status] as ProviderPaymentEventType

    return {
      providerEventId: `${parsed.data.id}:${parsed.data.status}:${parsed.data.amount}`,
      providerPaymentId: parsed.data.id,
      eventType,
      amountRub: parsed.data.amount,
      refundedAmountRub:
        parsed.data.status === "CHARGEBACKED" ? parsed.data.amount : undefined,
      currency: parsed.data.currency,
      payload: parsed.data,
    }
  }
}

export function getPaymentProvider(
  provider: PaymentProviderType
): PaymentProviderAdapter {
  if (provider === PaymentProviderType.MOCK) {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_MOCK_PAYMENT_PROVIDER !== "true"
    ) {
      throw new IntegrationError(
        "Mock payment provider is disabled in production."
      )
    }

    return new MockPaymentProvider()
  }

  if (provider === PaymentProviderType.PLATEGA) {
    return new PlategaPaymentProvider()
  }

  throw new IntegrationError(`Payment provider ${provider} is not configured.`)
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new IntegrationError(`${name} is required.`)
  }
  return value
}

function getPlategaApiUrl() {
  return process.env.PLATEGA_API_URL ?? "https://app.platega.io"
}

function getAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  )
}

export function getConfiguredPaymentProvider() {
  const configured = process.env.PAYMENT_PROVIDER ?? "PLATEGA"

  if (!(configured in PaymentProviderType)) {
    throw new IntegrationError(`Unknown payment provider ${configured}.`)
  }

  return getPaymentProvider(
    PaymentProviderType[configured as keyof typeof PaymentProviderType]
  )
}

export function createMockWebhookSignature(rawBody: string) {
  return createHmac("sha256", getMockWebhookSecret())
    .update(rawBody)
    .digest("hex")
}

function getMockWebhookSecret() {
  const secret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET

  if (secret) {
    return secret
  }

  if (process.env.NODE_ENV === "production") {
    throw new IntegrationError(
      "MOCK_PAYMENT_WEBHOOK_SECRET is required in production."
    )
  }

  return "pulsar-development-mock-webhook-secret"
}
