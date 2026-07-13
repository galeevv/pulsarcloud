import { notFound } from "next/navigation"
import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"
import { applyPaymentEvent } from "@/src/server/domain/billing/service"
import { randomToken } from "@/src/server/infrastructure/security/crypto"
import { z } from "zod"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"

const testPaymentSchema = z.object({
  status: z.enum(["CONFIRMED", "FAILED", "CANCELED"]),
  duplicateEventId: z.string().min(1).max(200).optional(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!getConfig().testMode) notFound()
  try {
    requireSameOrigin(request)
    const session = await requireWebSession("USER")
    const { id } = await context.params
    const payment = await db.payment.findUniqueOrThrow({ where: { id } })
    if (
      payment.userId !== session.userId ||
      !payment.isTest ||
      !payment.externalPaymentId
    )
      return new Response("Forbidden", { status: 403 })
    const body = testPaymentSchema.parse(await request.json())
    const eventId =
      body.duplicateEventId ??
      `test:${payment.id}:${body.status}:${randomToken(8)}`
    await applyPaymentEvent({
      eventId,
      eventType: body.status,
      externalPaymentId: payment.externalPaymentId,
      status: body.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      payload: {
        id: payment.externalPaymentId,
        status: body.status,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        eventId,
      },
    })
    return Response.json({ ok: true, eventId })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
