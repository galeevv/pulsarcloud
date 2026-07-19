import { z } from "zod"

import { BusinessError } from "@/src/server/application/errors"
import { getConfig } from "@/src/server/config"
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
    const id = z
      .string()
      .min(8)
      .max(100)
      .parse((await context.params).id)
    const testMode = getConfig().testMode
    const details = await db.$transaction(async (tx) => {
      const payout = await tx.payoutRequest.findFirst({
        where: {
          id,
          user: { is: { role: "USER", isTest: testMode } },
        },
        select: { payoutDetailsEncrypted: true },
      })
      if (!payout) throw new BusinessError("NOT_FOUND", 404)

      const revealed = decryptSensitive(payout.payoutDetailsEncrypted)
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: session.userId,
          action: "PAYOUT_DETAILS_REVEALED",
          entityType: "PayoutRequest",
          entityId: id,
          correlationId: correlationId(),
        },
      })
      return revealed
    })
    return Response.json(
      { details },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return routeErrorResponse(error)
  }
}
