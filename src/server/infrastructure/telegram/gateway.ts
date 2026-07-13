import { getConfig } from "@/src/server/config"

export interface TelegramGateway {
  sendMessage(input: {
    chatId: string
    text: string
    replyMarkup?: unknown
  }): Promise<{ messageId: string }>
}

class BotApiGateway implements TelegramGateway {
  async sendMessage(input: {
    chatId: string
    text: string
    replyMarkup?: unknown
  }) {
    const token = getConfig().telegram.botToken
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing")
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          reply_markup: input.replyMarkup,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      }
    )
    const body = (await response.json()) as {
      ok: boolean
      result?: { message_id: number }
      description?: string
    }
    if (!response.ok || !body.ok || !body.result)
      throw new Error(
        `Telegram send failed: ${body.description ?? response.status}`
      )
    return { messageId: String(body.result.message_id) }
  }
}

class TestTelegramGateway implements TelegramGateway {
  async sendMessage() {
    return { messageId: `test_${Date.now()}` }
  }
}
export function getTelegramGateway(): TelegramGateway {
  return getConfig().testMode ? new TestTelegramGateway() : new BotApiGateway()
}
