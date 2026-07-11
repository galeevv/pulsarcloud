import { IntegrationError } from "@/lib/application-errors"

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { buttonText: string; buttonUrl: string }
) {
  const token = requireEnv("TELEGRAM_BOT_TOKEN")
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: options
          ? {
              inline_keyboard: [
                [{ text: options.buttonText, url: options.buttonUrl }],
              ],
            }
          : undefined,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!response.ok)
    throw new IntegrationError("Telegram rejected bot message.", {
      status: response.status,
    })
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new IntegrationError(`${name} is required.`)
  return value
}
