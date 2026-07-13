import { z } from "zod"
import { createPayout } from "@/src/server/domain/wallet/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import { requireWebSession } from "@/src/server/transport/web/session"

const payoutSchema = z.object({
  amountMinor: z.number().int().positive(),
  details: z.string().trim().min(4).max(500),
  idempotencyKey: z.string().min(8).max(200),
})

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const session = await requireWebSession("USER")
    const body = payoutSchema.parse(await request.json())
    const payout = await createPayout({ userId: session.userId, ...body })
    return Response.json({ id: payout.id })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
