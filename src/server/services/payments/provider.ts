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
      throw new ValidationError("Payment webhook body is not valid JSON.", {}, {
        cause: error,
      })
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

  throw new IntegrationError(`Payment provider ${provider} is not configured.`)
}

export function getConfiguredPaymentProvider() {
  const configured = process.env.PAYMENT_PROVIDER ?? "MOCK"

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
