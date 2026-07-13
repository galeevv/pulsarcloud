import { db } from "@/src/server/infrastructure/db/client"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import {
  clearSessionCookie,
  getSession,
} from "@/src/server/transport/web/session"

export async function POST(request: Request) {
  try {
    requireSameOrigin(request, { requireJson: false })
    for (const kind of ["USER", "ADMIN"] as const) {
      const session = await getSession(kind)
      if (session)
        await db.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        })
      await clearSessionCookie(kind)
    }
    return Response.json({ ok: true })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
