import { requestSubscriptionUrlRegeneration } from "@/src/server/domain/subscriptions/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import { requireWebSession } from "@/src/server/transport/web/session"

export async function POST(request: Request) {
  try {
    requireSameOrigin(request, { requireJson: false })
    const session = await requireWebSession("USER")
    await requestSubscriptionUrlRegeneration(session.userId)
    return Response.json({ ok: true })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
