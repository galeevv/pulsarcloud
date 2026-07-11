import { PaymentProvider } from "@/generated/prisma/client"

import {
  ConflictError,
  IntegrationError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/application-errors"
import { verifyAndProcessPaymentWebhook } from "@/src/server/services/billing/payment-webhook-service"

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await context.params
  const provider = parseProvider(rawProvider)

  if (!provider) {
    return Response.json({ error: "Unknown payment provider." }, { status: 404 })
  }

  try {
    const result = await verifyAndProcessPaymentWebhook(
      provider,
      await request.text(),
      request.headers
    )
    return Response.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 })
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof ConflictError) {
      return Response.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof IntegrationError) {
      return Response.json({ error: error.message }, { status: 503 })
    }
    throw error
  }
}

function parseProvider(value: string) {
  const normalized = value.toUpperCase()
  return normalized === PaymentProvider.MOCK
    ? PaymentProvider.MOCK
    : normalized === PaymentProvider.PLATEGA
      ? PaymentProvider.PLATEGA
      : null
}
