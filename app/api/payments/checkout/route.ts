import { z } from "zod"
import { createCheckout } from "@/src/server/domain/billing/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import { requireWebSession } from "@/src/server/transport/web/session"

const checkoutSchema = z.object({
  durationMonths: z.union([
    z.literal(1),
    z.literal(3),
    z.literal(6),
    z.literal(12),
  ]),
  deviceLimit: z.number().int().min(1).max(5),
  lteEnabled: z.boolean(),
  paymentMethod: z.enum(["SBP", "WALLET"]).default("SBP"),
  expectedAmountMinor: z.number().int().positive(),
  pricingVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(200),
})

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const session = await requireWebSession("USER")
    const body = checkoutSchema.parse(await request.json())
    const payment = await createCheckout({ userId: session.userId, ...body })
    return Response.json({
      paymentId: payment.id,
      checkoutUrl: payment.checkoutUrl,
    })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
