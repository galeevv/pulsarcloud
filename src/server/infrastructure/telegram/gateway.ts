import { getConfig } from "@/src/server/config"

export type TelegramGatewayEvent =
  | {
      type: "sendMessage"
      chatId: string
      text: string
      replyMarkup?: unknown
      parseMode?: "HTML"
    }
  | {
      type: "sendPhoto"
      chatId: string
      photo: string
      caption: string
      replyMarkup?: unknown
      parseMode?: "HTML"
    }
  | {
      type: "editMessageText"
      chatId: string
      messageId: string
      text: string
      replyMarkup?: unknown
      parseMode?: "HTML"
    }
  | {
      type: "editMessageCaption"
      chatId: string
      messageId: string
      caption: string
      replyMarkup?: unknown
      parseMode?: "HTML"
    }
  | {
      type: "answerCallbackQuery"
      callbackQueryId: string
      text?: string
      showAlert?: boolean
    }

export interface TelegramGateway {
  sendMessage(input: {
    chatId: string
    text: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }): Promise<{ messageId: string }>
  sendPhoto(input: {
    chatId: string
    photo: string
    caption: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }): Promise<{ messageId: string }>
  editMessageText(input: {
    chatId: string
    messageId: string
    text: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }): Promise<{ messageId: string }>
  editMessageCaption(input: {
    chatId: string
    messageId: string
    caption: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }): Promise<{ messageId: string }>
  answerCallbackQuery(input: {
    callbackQueryId: string
    text?: string
    showAlert?: boolean
  }): Promise<void>
}

export type TelegramGatewayFailureReason =
  | "CALLBACK_QUERY_EXPIRED"
  | "CONFIGURATION"
  | "MESSAGE_NOT_MODIFIED"
  | "PERMANENT_REQUEST"
  | "RATE_LIMITED"
  | "RECIPIENT_UNAVAILABLE"
  | "TRANSIENT"

export class TelegramGatewayError extends Error {
  readonly name = "TelegramGatewayError"

  constructor(
    readonly reason: TelegramGatewayFailureReason,
    readonly statusCode: number | null = null,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(`TELEGRAM_${reason}`)
  }
}

export function classifyTelegramGatewayFailure(
  statusCode: number,
  description: string
): TelegramGatewayFailureReason {
  if (/message is not modified/i.test(description)) return "MESSAGE_NOT_MODIFIED"
  if (
    /query is too old|query id is invalid|query_id_invalid/i.test(description)
  )
    return "CALLBACK_QUERY_EXPIRED"
  if (
    statusCode === 403 ||
    /bot was blocked|blocked by the user|user is deactivated|chat not found|forbidden/i.test(
      description
    )
  )
    return "RECIPIENT_UNAVAILABLE"
  if (statusCode === 429) return "RATE_LIMITED"
  if (statusCode === 401) return "CONFIGURATION"
  if (statusCode === 400) return "PERMANENT_REQUEST"
  return "TRANSIENT"
}

export function isPermanentTelegramDeliveryError(
  error: unknown
): error is TelegramGatewayError {
  return (
    error instanceof TelegramGatewayError &&
    (error.reason === "PERMANENT_REQUEST" ||
      error.reason === "RECIPIENT_UNAVAILABLE")
  )
}

class BotApiGateway implements TelegramGateway {
  private async call<T>(method: string, payload: Record<string, unknown>) {
    const token = getConfig().telegram.botToken
    if (!token) throw new TelegramGatewayError("CONFIGURATION")
    let response: Response
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new TelegramGatewayError("TRANSIENT")
    }
    let body: {
      ok: boolean
      result?: T
      description?: string
      error_code?: number
      parameters?: {
        retry_after?: number
      }
    }
    try {
      body = (await response.json()) as typeof body
    } catch {
      throw new TelegramGatewayError("TRANSIENT", response.status)
    }
    if (!response.ok || !body.ok || body.result === undefined) {
      const statusCode = body.error_code ?? response.status
      const retryAfterSeconds = body.parameters?.retry_after
      throw new TelegramGatewayError(
        classifyTelegramGatewayFailure(statusCode, body.description ?? ""),
        statusCode,
        typeof retryAfterSeconds === "number" &&
          Number.isFinite(retryAfterSeconds) &&
          retryAfterSeconds > 0
          ? Math.min(Math.ceil(retryAfterSeconds), 86_400)
          : null
      )
    }
    return body.result
  }

  async sendMessage(input: {
    chatId: string
    text: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }) {
    const result = await this.call<{ message_id: number }>("sendMessage", {
      chat_id: input.chatId,
      text: input.text,
      reply_markup: input.replyMarkup,
      parse_mode: input.parseMode,
      link_preview_options: { is_disabled: true },
    })
    return { messageId: String(result.message_id) }
  }

  async sendPhoto(input: {
    chatId: string
    photo: string
    caption: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }) {
    const result = await this.call<{ message_id: number }>("sendPhoto", {
      chat_id: input.chatId,
      photo: input.photo,
      caption: input.caption,
      reply_markup: input.replyMarkup,
      parse_mode: input.parseMode,
    })
    return { messageId: String(result.message_id) }
  }

  async editMessageText(input: {
    chatId: string
    messageId: string
    text: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }) {
    try {
      const result = await this.call<{ message_id: number }>(
        "editMessageText",
        {
          chat_id: input.chatId,
          message_id: input.messageId,
          text: input.text,
          reply_markup: input.replyMarkup,
          parse_mode: input.parseMode,
          link_preview_options: { is_disabled: true },
        }
      )
      return { messageId: String(result.message_id) }
    } catch (error) {
      if (
        error instanceof TelegramGatewayError &&
        error.reason === "MESSAGE_NOT_MODIFIED"
      )
        return { messageId: input.messageId }
      throw error
    }
  }

  async editMessageCaption(input: {
    chatId: string
    messageId: string
    caption: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }) {
    try {
      const result = await this.call<{ message_id: number }>(
        "editMessageCaption",
        {
          chat_id: input.chatId,
          message_id: input.messageId,
          caption: input.caption,
          reply_markup: input.replyMarkup,
          parse_mode: input.parseMode,
        }
      )
      return { messageId: String(result.message_id) }
    } catch (error) {
      if (
        error instanceof TelegramGatewayError &&
        error.reason === "MESSAGE_NOT_MODIFIED"
      )
        return { messageId: input.messageId }
      throw error
    }
  }

  async answerCallbackQuery(input: {
    callbackQueryId: string
    text?: string
    showAlert?: boolean
  }) {
    try {
      await this.call<boolean>("answerCallbackQuery", {
        callback_query_id: input.callbackQueryId,
        text: input.text,
        show_alert: input.showAlert,
      })
    } catch (error) {
      // Telegram callback queries are short lived. A retried outbox job may
      // legitimately render the requested screen after the query expired.
      if (
        error instanceof TelegramGatewayError &&
        error.reason === "CALLBACK_QUERY_EXPIRED"
      )
        return
      throw error
    }
  }
}

const testEvents: TelegramGatewayEvent[] = []

class TestTelegramGateway implements TelegramGateway {
  async sendMessage(input: {
    chatId: string
    text: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }) {
    testEvents.push({ type: "sendMessage", ...input })
    return { messageId: `test_${Date.now()}` }
  }

  async sendPhoto(input: {
    chatId: string
    photo: string
    caption: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }) {
    testEvents.push({ type: "sendPhoto", ...input })
    return { messageId: `test_${Date.now()}` }
  }

  async editMessageText(input: {
    chatId: string
    messageId: string
    text: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }) {
    testEvents.push({ type: "editMessageText", ...input })
    return { messageId: input.messageId }
  }

  async editMessageCaption(input: {
    chatId: string
    messageId: string
    caption: string
    replyMarkup?: unknown
    parseMode?: "HTML"
  }) {
    testEvents.push({ type: "editMessageCaption", ...input })
    return { messageId: input.messageId }
  }

  async answerCallbackQuery(input: {
    callbackQueryId: string
    text?: string
    showAlert?: boolean
  }) {
    testEvents.push({ type: "answerCallbackQuery", ...input })
  }
}

export function getTestTelegramGatewayEvents() {
  if (!getConfig().localAuthAdaptersEnabled) return []
  return [...testEvents]
}

export function resetTestTelegramGatewayEvents() {
  if (getConfig().localAuthAdaptersEnabled) testEvents.length = 0
}

export function getTelegramGateway(): TelegramGateway {
  const config = getConfig()
  return config.localAuthAdaptersEnabled
    ? new TestTelegramGateway()
    : new BotApiGateway()
}
