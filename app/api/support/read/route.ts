import { z } from "zod"

import { markSupportRepliesRead } from "@/src/server/domain/support/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import { requireWebSession } from "@/src/server/transport/web/session"

const readSchema = z.object({
  through: z.iso.datetime({ offset: true }),
})

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const session = await requireWebSession("USER")
    const input = readSchema.parse(await request.json())
    const changed = await markSupportRepliesRead({
      userId: session.userId,
      through: new Date(input.through),
    })
    return Response.json(
      { changed },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    return routeErrorResponse(error)
  }
}
