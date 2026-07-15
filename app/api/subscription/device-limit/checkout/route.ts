import { z } from "zod"

import { createDeviceLimitUpgradeCheckout } from "@/src/server/domain/billing/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import { requireWebSession } from "@/src/server/transport/web/session"

const checkoutSchema = z.object({
  targetDeviceLimit: z.number().int().min(1).max(5),
  expectedAmountMinor: z.number().int().positive(),
  pricingVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(200),
})

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const session = await requireWebSession("USER")
    const body = checkoutSchema.parse(await request.json())
    const payment = await createDeviceLimitUpgradeCheckout({
      userId: session.userId,
      ...body,
    })
    return Response.json({
      paymentId: payment.id,
      checkoutUrl: payment.checkoutUrl,
    })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
