import { z } from "zod"
import { sendSupportMessage } from "@/src/server/domain/support/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"
import { requireWebSession } from "@/src/server/transport/web/session"
import { db } from "@/src/server/infrastructure/db/client"

const supportSchema = z.object({ body: z.string().trim().min(2).max(1000) })

export async function GET() {
  try {
    const session = await requireWebSession("USER")
    const conversation = await db.supportConversation.findUnique({
      where: { userId: session.userId },
      select: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { id: true, authorRole: true, body: true, createdAt: true },
        },
      },
    })
    return Response.json(
      { messages: [...(conversation?.messages ?? [])].reverse() },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    return routeErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const session = await requireWebSession("USER")
    const body = supportSchema.parse(await request.json())
    const message = await sendSupportMessage({
      userId: session.userId,
      body: body.body,
    })
    return Response.json({ id: message.id })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
