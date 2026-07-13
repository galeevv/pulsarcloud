import { getConfig } from "@/src/server/config"
import { db, withBusyRetry } from "@/src/server/infrastructure/db/client"
import {
  hashToken,
  safeEqual,
} from "@/src/server/infrastructure/security/crypto"

type TelegramUpdate = {
  update_id?: number
  message?: unknown
  callback_query?: unknown
}

type StoredTelegramMessage = {
  command: "start" | "account" | "notifications" | "help" | "other"
  startTokenHash?: string
  chat?: { id: string; type?: string }
  from?: { id: string; username?: string }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined
}

function telegramId(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : undefined
}

function commandFromText(
  text: unknown
): Pick<StoredTelegramMessage, "command" | "startTokenHash"> {
  if (typeof text !== "string") return { command: "other" }
  const [rawCommand = "", startToken] = text.trim().split(/\s+/, 2)
  const command = rawCommand.toLowerCase().split("@", 1)[0]
  if (command === "/start")
    return {
      command: "start",
      ...(startToken ? { startTokenHash: hashToken(startToken) } : {}),
    }
  if (command === "/account") return { command: "account" }
  if (command === "/notifications") return { command: "notifications" }
  if (command === "/help") return { command: "help" }
  return { command: "other" }
}

export function normalizeTelegramUpdate(update: TelegramUpdate) {
  const message = record(update.message)
  if (!message) return {}
  const chat = record(message.chat)
  const from = record(message.from)
  const chatId = telegramId(chat?.id)
  const fromId = telegramId(from?.id)
  const chatType =
    typeof chat?.type === "string" ? chat.type.slice(0, 32) : undefined
  const username =
    typeof from?.username === "string" ? from.username.slice(0, 64) : undefined
  return {
    message: {
      ...commandFromText(message.text),
      ...(chatId
        ? { chat: { id: chatId, ...(chatType ? { type: chatType } : {}) } }
        : {}),
      ...(fromId
        ? { from: { id: fromId, ...(username ? { username } : {}) } }
        : {}),
    } satisfies StoredTelegramMessage,
  }
}

export async function POST(request: Request) {
  const configured = getConfig().telegram.webhookSecret
  const received = request.headers.get("x-telegram-bot-api-secret-token") ?? ""
  if (!configured || !safeEqual(configured, received))
    return new Response("Unauthorized", { status: 401 })
  if (Number(request.headers.get("content-length") ?? 0) > 256_000)
    return new Response("Payload too large", { status: 413 })
  const text = await request.text()
  if (Buffer.byteLength(text) > 256_000)
    return new Response("Payload too large", { status: 413 })
  let update: TelegramUpdate
  try {
    update = JSON.parse(text) as typeof update
  } catch {
    return new Response("Bad request", { status: 400 })
  }
  if (!Number.isSafeInteger(update.update_id))
    return new Response("Bad request", { status: 400 })
  const updateId = String(update.update_id)
  await withBusyRetry(() =>
    db.$transaction(async (tx) => {
      const existing = await tx.telegramUpdateLog.findUnique({
        where: { updateId },
      })
      if (existing) return
      await tx.telegramUpdateLog.create({
        data: {
          updateId,
          updateType: update.message
            ? "message"
            : update.callback_query
              ? "callback_query"
              : "other",
          // Telegram start parameters are bearer credentials. Persist only a
          // normalized command and its HMAC, never the raw message text.
          payloadJson: JSON.stringify(normalizeTelegramUpdate(update)),
        },
      })
      await tx.outboxJob.create({
        data: {
          type: "PROCESS_TELEGRAM_UPDATE",
          aggregateType: "TelegramUpdate",
          aggregateId: updateId,
          payloadJson: JSON.stringify({ updateId }),
          dedupeKey: `telegram-update:${updateId}`,
          maxAttempts: 6,
        },
      })
    })
  )
  return new Response("OK")
}
