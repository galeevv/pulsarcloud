import { getConfig } from "@/src/server/config"
import { db, withBusyRetry } from "@/src/server/infrastructure/db/client"
import {
  hashToken,
  safeEqual,
} from "@/src/server/infrastructure/security/crypto"
import {
  isTelegramCallbackAction,
  type TelegramCallbackAction,
} from "@/src/server/domain/telegram/service"

type TelegramUpdate = {
  update_id?: number
  message?: unknown
  callback_query?: unknown
  my_chat_member?: unknown
}

type StoredTelegramFrom = {
  id: string
  username?: string
  firstName?: string
  lastName?: string
}

type StoredTelegramMessage = {
  command: "start" | "account" | "notifications" | "help" | "other"
  startTokenHash?: string
  referralInviteCode?: string
  chat?: { id: string; type?: string }
  from?: StoredTelegramFrom
}

type StoredTelegramCallback = {
  id?: string
  action?: TelegramCallbackAction | "other"
  from?: StoredTelegramFrom
  message?: {
    messageId?: string
    presentation?: "caption" | "text"
    chat?: { id: string; type?: string }
  }
}

type StoredMyChatMember = {
  chat?: { id: string; type?: string }
  from?: StoredTelegramFrom
  status?: string
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

function shortString(value: unknown, max: number) {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, max)
    : undefined
}

function normalizeFrom(value: unknown): StoredTelegramFrom | undefined {
  const from = record(value)
  const id = telegramId(from?.id)
  if (!id) return undefined
  const username = shortString(from?.username, 64)
  const firstName = shortString(from?.first_name, 128)
  const lastName = shortString(from?.last_name, 128)
  return {
    id,
    ...(username ? { username } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
  }
}

function normalizeChat(value: unknown) {
  const chat = record(value)
  const id = telegramId(chat?.id)
  if (!id) return undefined
  const type = shortString(chat?.type, 32)
  return { id, ...(type ? { type } : {}) }
}

function commandFromText(
  text: unknown
): Pick<
  StoredTelegramMessage,
  "command" | "startTokenHash" | "referralInviteCode"
> {
  if (typeof text !== "string") return { command: "other" }
  const [rawCommand = "", startToken] = text.trim().split(/\s+/, 2)
  const command = rawCommand.toLowerCase().split("@", 1)[0]
  if (command === "/start") {
    const referralMatch = startToken?.match(/^ref_([A-Za-z0-9_-]{8,64})$/)
    const referralInviteCode = referralMatch?.[1]
    return {
      command: "start",
      ...(referralInviteCode
        ? { referralInviteCode }
        : startToken
          ? { startTokenHash: hashToken(startToken) }
          : {}),
    }
  }
  if (command === "/account") return { command: "account" }
  if (command === "/notifications") return { command: "notifications" }
  if (command === "/help") return { command: "help" }
  return { command: "other" }
}

export function normalizeTelegramUpdate(update: TelegramUpdate) {
  const message = record(update.message)
  if (message)
    return {
      message: {
        ...commandFromText(message.text),
        ...(normalizeChat(message.chat)
          ? { chat: normalizeChat(message.chat) }
          : {}),
        ...(normalizeFrom(message.from)
          ? { from: normalizeFrom(message.from) }
          : {}),
      } satisfies StoredTelegramMessage,
    }

  const callback = record(update.callback_query)
  if (callback) {
    const callbackMessage = record(callback.message)
    const action = isTelegramCallbackAction(callback.data)
      ? callback.data
      : "other"
    const messageId = telegramId(callbackMessage?.message_id)
    const presentation =
      Array.isArray(callbackMessage?.photo) ||
      typeof callbackMessage?.caption === "string"
        ? "caption"
        : "text"
    return {
      callbackQuery: {
        ...(shortString(callback.id, 256)
          ? { id: shortString(callback.id, 256) }
          : {}),
        action,
        ...(normalizeFrom(callback.from)
          ? { from: normalizeFrom(callback.from) }
          : {}),
        ...(callbackMessage
          ? {
              message: {
                ...(messageId ? { messageId } : {}),
                presentation,
                ...(normalizeChat(callbackMessage.chat)
                  ? { chat: normalizeChat(callbackMessage.chat) }
                  : {}),
              },
            }
          : {}),
      } satisfies StoredTelegramCallback,
    }
  }

  const membership = record(update.my_chat_member)
  if (membership) {
    const newMember = record(membership.new_chat_member)
    return {
      myChatMember: {
        ...(normalizeChat(membership.chat)
          ? { chat: normalizeChat(membership.chat) }
          : {}),
        ...(normalizeFrom(membership.from)
          ? { from: normalizeFrom(membership.from) }
          : {}),
        ...(shortString(newMember?.status, 32)
          ? { status: shortString(newMember?.status, 32) }
          : {}),
      } satisfies StoredMyChatMember,
    }
  }
  return {}
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
              : update.my_chat_member
                ? "my_chat_member"
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
