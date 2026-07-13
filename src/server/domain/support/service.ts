import { db, withBusyRetry } from "@/src/server/infrastructure/db/client"
import { BusinessError } from "@/src/server/application/errors"

export async function sendSupportMessage(input: {
  userId: string
  body: string
  admin?: boolean
}) {
  const body = input.body.replace(/\r\n/g, "\n").trim()
  if (body.length < 2 || body.length > 1000)
    throw new BusinessError("INVALID_INPUT")
  if (!input.admin) {
    const now = new Date()
    const limits = [
      { suffix: "minute", windowMs: 60_000, max: 5 },
      { suffix: "hour", windowMs: 60 * 60_000, max: 30 },
    ]
    for (const limit of limits) {
      const windowStart = new Date(
        Math.floor(now.getTime() / limit.windowMs) * limit.windowMs
      )
      const bucket = await withBusyRetry(() =>
        db.rateLimitBucket.upsert({
          where: {
            key_windowStart: {
              key: `support:${input.userId}:${limit.suffix}`,
              windowStart,
            },
          },
          create: {
            key: `support:${input.userId}:${limit.suffix}`,
            windowStart,
            count: 1,
            expiresAt: new Date(windowStart.getTime() + limit.windowMs * 2),
          },
          update: { count: { increment: 1 } },
        })
      )
      if (bucket.count > limit.max)
        throw new BusinessError("AUTH_RATE_LIMITED", 429)
    }
  }
  return withBusyRetry(() =>
    db.$transaction(async (tx) => {
      const conversation = await tx.supportConversation.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId },
        update: { status: "OPEN", lastMessageAt: new Date() },
      })
      return tx.supportMessage.create({
        data: {
          conversationId: conversation.id,
          authorRole: input.admin ? "ADMIN" : "USER",
          senderUserId: input.userId,
          source: input.admin ? "ADMIN" : "WEB",
          body,
        },
      })
    })
  )
}
