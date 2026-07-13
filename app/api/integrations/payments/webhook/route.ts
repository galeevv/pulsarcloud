import { BusinessError } from "@/src/server/application/errors"
import { applyPaymentEvent } from "@/src/server/domain/billing/service"
import { logger } from "@/src/server/infrastructure/logging/logger"
import {
  getPaymentProvider,
  PaymentWebhookVerificationError,
} from "@/src/server/infrastructure/payments/provider"

const MAX_CALLBACK_BYTES = 64 * 1024

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CALLBACK_BYTES)
    return new Response("Payload too large", { status: 413 })

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return new Response("Bad request", { status: 400 })
  }
  if (Buffer.byteLength(rawBody) > MAX_CALLBACK_BYTES)
    return new Response("Payload too large", { status: 413 })

  try {
    const verifiedRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: rawBody,
    })
    const event = await getPaymentProvider().verifyWebhook(verifiedRequest)
    await applyPaymentEvent(event)
    return new Response("OK")
  } catch (error) {
    if (error instanceof PaymentWebhookVerificationError)
      return new Response("Invalid callback", { status: error.status })
    if (error instanceof SyntaxError)
      return new Response("Invalid callback", { status: 400 })
    if (error instanceof BusinessError && error.code === "CONFLICT")
      return new Response("Recorded for review")
    logger.error("payment callback processing failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response("Temporary failure", { status: 503 })
  }
}
