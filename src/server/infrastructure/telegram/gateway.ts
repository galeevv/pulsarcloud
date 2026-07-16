import { getConfig } from "@/src/server/config"

export type TelegramGatewayEvent =
  | {
      type: "sendMessage"
      chatId: string
      text: string
      replyMarkup?: unknown
    }
  | {
      type: "editMessageText"
      chatId: string
      messageId: string
      text: string
      replyMarkup?: unknown
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
  }): Promise<{ messageId: string }>
  editMessageText(input: {
    chatId: string
    messageId: string
    text: string
    replyMarkup?: unknown
  }): Promise<{ messageId: string }>
  answerCallbackQuery(input: {
    callbackQueryId: string
    text?: string
    showAlert?: boolean
  }): Promise<void>
}

class BotApiGateway implements TelegramGateway {
  private async call<T>(method: string, payload: Record<string, unknown>) {
    const token = getConfig().telegram.botToken
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing")
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await response.json()) as {
      ok: boolean
      result?: T
      description?: string
    }
    if (!response.ok || !body.ok || body.result === undefined)
      throw new Error(
        `Telegram ${method} failed: ${body.description ?? response.status}`
      )
    return body.result
  }

  async sendMessage(input: {
    chatId: string
    text: string
    replyMarkup?: unknown
  }) {
    const result = await this.call<{ message_id: number }>("sendMessage", {
      chat_id: input.chatId,
      text: input.text,
      reply_markup: input.replyMarkup,
      link_preview_options: { is_disabled: true },
    })
    return { messageId: String(result.message_id) }
  }

  async editMessageText(input: {
    chatId: string
    messageId: string
    text: string
    replyMarkup?: unknown
  }) {
    try {
      const result = await this.call<{ message_id: number }>(
        "editMessageText",
        {
          chat_id: input.chatId,
          message_id: input.messageId,
          text: input.text,
          reply_markup: input.replyMarkup,
          link_preview_options: { is_disabled: true },
        }
      )
      return { messageId: String(result.message_id) }
    } catch (error) {
      if (error instanceof Error && /message is not modified/i.test(error.message))
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
        error instanceof Error &&
        /query is too old|query id is invalid|query_id_invalid/i.test(
          error.message
        )
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
  }) {
    testEvents.push({ type: "sendMessage", ...input })
    return { messageId: `test_${Date.now()}` }
  }

  async editMessageText(input: {
    chatId: string
    messageId: string
    text: string
    replyMarkup?: unknown
  }) {
    testEvents.push({ type: "editMessageText", ...input })
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
