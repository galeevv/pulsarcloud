import {
  JobType,
  TelegramUpdateStatus,
  type Prisma,
} from "@/generated/prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { hashValue, timingSafeStringEqual } from "@/lib/security"
import { runInTransaction } from "@/lib/transactions"

const envelopeSchema = z
  .object({ update_id: z.number().int().nonnegative() })
  .passthrough()

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  const supplied = request.headers.get("x-telegram-bot-api-secret-token")
  if (!expected || !supplied || !timingSafeStringEqual(expected, supplied))
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  const rawBody = await request.text()
  let value: unknown
  try {
    value = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = envelopeSchema.safeParse(value)
  if (!parsed.success)
    return Response.json({ error: "Invalid update" }, { status: 400 })
  const updateId = BigInt(parsed.data.update_id)
  await runInTransaction(prisma, async (tx) => {
    if (await tx.telegramUpdate.findUnique({ where: { updateId } })) return
    await tx.telegramUpdate.create({
      data: {
        updateId,
        payloadHash: hashValue(rawBody),
        payload: parsed.data as Prisma.InputJsonValue,
        status: TelegramUpdateStatus.RECEIVED,
      },
    })
    await tx.job.create({
      data: {
        type: JobType.PROCESS_TELEGRAM_UPDATE,
        idempotencyKey: `telegram:update:${updateId}`,
        payload: { updateId: String(updateId) },
      },
    })
  })
  return Response.json({ ok: true })
}
