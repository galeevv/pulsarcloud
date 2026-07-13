import { requireWebSession } from "@/src/server/transport/web/session"
import { db } from "@/src/server/infrastructure/db/client"
import {
  decryptSensitive,
  correlationId,
} from "@/src/server/infrastructure/security/crypto"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireSameOrigin(request, { requireJson: false })
    const session = await requireWebSession("ADMIN")
    const { id } = await context.params
    const payout = await db.payoutRequest.findUniqueOrThrow({ where: { id } })
    await db.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "PAYOUT_DETAILS_REVEALED",
        entityType: "PayoutRequest",
        entityId: id,
        correlationId: correlationId(),
      },
    })
    return Response.json(
      { details: decryptSensitive(payout.payoutDetailsEncrypted) },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return routeErrorResponse(error)
  }
}
