import { notFound } from "next/navigation"
import { z } from "zod"
import { getConfig } from "@/src/server/config"
import { completeTelegramStart } from "@/src/server/domain/auth/service"
import {
  requireSameOrigin,
  routeErrorResponse,
} from "@/src/server/transport/http/security"

const testTelegramSchema = z.object({
  token: z.string().min(16).max(256),
  telegramId: z.string().regex(/^\d{1,20}$/),
  username: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_]+$/)
    .optional(),
})
const challengeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/)

export async function POST(
  request: Request,
  context: { params: Promise<{ challengeId: string }> }
) {
  const config = getConfig()
  if (!config.localAuthAdaptersEnabled) notFound()

  try {
    requireSameOrigin(request)
    const challengeId = challengeIdSchema.parse(
      (await context.params).challengeId
    )
    const body = testTelegramSchema.parse(await request.json())
    const result = await completeTelegramStart({
      challengeId,
      rawStartToken: body.token,
      telegramId: body.telegramId,
      username: body.username,
      chatId: body.telegramId,
    })
    const redirectTo = result.linked
      ? "/profile"
      : `/api/auth/telegram/complete?challenge=${encodeURIComponent(challengeId)}&token=${encodeURIComponent(result.completionToken!)}`

    return Response.json({ redirectTo })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
