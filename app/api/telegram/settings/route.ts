import { z } from "zod"
import { db } from "@/src/server/infrastructure/db/client"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import { requireWebSession } from "@/src/server/transport/web/session"

const settingsSchema = z.object({
  transactional: z.boolean(),
  news: z.boolean(),
})

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const session = await requireWebSession("USER")
    const body = settingsSchema.parse(await request.json())
    const profile = await db.telegramProfile.update({
      where: { userId: session.userId },
      data: {
        transactionalNotificationsEnabled: body.transactional,
        newsNotificationsEnabled: body.news,
      },
    })
    return Response.json({
      transactional: profile.transactionalNotificationsEnabled,
      news: profile.newsNotificationsEnabled,
    })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
