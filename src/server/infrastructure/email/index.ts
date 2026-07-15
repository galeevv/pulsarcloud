import { Resend } from "resend"
import { getConfig } from "@/src/server/config"

export interface EmailSender {
  sendOtp(input: {
    to: string
    otp: string
    expiresMinutes: number
    magicLinkUrl: string
  }): Promise<void>
}

type OtpEmailContentInput = Pick<
  Parameters<EmailSender["sendOtp"]>[0],
  "otp" | "expiresMinutes" | "magicLinkUrl"
>

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function renderOtpEmail(input: OtpEmailContentInput) {
  const otp = escapeHtml(input.otp)
  const magicLinkUrl = escapeHtml(input.magicLinkUrl)
  const expiresMinutes = Number.isFinite(input.expiresMinutes)
    ? Math.max(1, Math.trunc(input.expiresMinutes))
    : 5

  return `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Вход в Pulsar</title></head>
<body style="margin:0;background:#080808;color:#f5f5f5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Ваш одноразовый код Pulsar: ${otp}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#080808;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:480px;border:1px solid #292929;border-radius:24px;background:#0c0c0c;overflow:hidden">
        <tr><td style="padding:34px 30px 10px;text-align:center">
          <h1 style="margin:0 0 7px;font-size:24px;line-height:1.25;font-weight:700;color:#f5f5f5">Вход в аккаунт</h1>
          <p style="margin:0;color:#969696;font-size:14px;line-height:1.55">Введите код в приложении или откройте одноразовую ссылку.</p>
        </td></tr>
        <tr><td style="padding:14px 30px;text-align:center">
          <div aria-label="Одноразовый код ${otp}" style="padding:18px 12px;border:1px solid #303030;border-radius:18px;background:#121212;color:#ffffff;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:34px;line-height:1;font-weight:700;letter-spacing:.22em;-webkit-user-select:all;user-select:all">${otp}</div>
        </td></tr>
        <tr><td style="padding:10px 30px 8px;text-align:center">
          <a href="${magicLinkUrl}" target="_blank" style="display:block;padding:14px 20px;border-radius:15px;background:#f1f1f1;color:#111111;text-decoration:none;font-size:14px;font-weight:700">Войти в Pulsar</a>
        </td></tr>
        <tr><td style="padding:18px 30px 30px;text-align:center;color:#777777;font-size:12px;line-height:1.6">
          Код и ссылка действуют ${expiresMinutes} минут и используются один раз.<br>
          Не запрашивали вход? Просто проигнорируйте письмо.
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:#555555;font-size:11px">Pulsar Cloud · безопасный доступ</p>
    </td></tr>
  </table>
</body>
</html>`
}

class ResendEmailSender implements EmailSender {
  private readonly client = new Resend(getConfig().resend.apiKey)
  async sendOtp(input: {
    to: string
    otp: string
    expiresMinutes: number
    magicLinkUrl: string
  }) {
    const { error } = await this.client.emails.send({
      from: getConfig().resend.from,
      to: input.to,
      subject: "Код входа в Pulsar",
      text: `Код входа: ${input.otp}\n\nВойти по одноразовой ссылке: ${input.magicLinkUrl}\n\nКод и ссылка действуют ${input.expiresMinutes} минут и используются один раз. Никому не сообщайте код.`,
      html: renderOtpEmail(input),
    })
    if (error) throw new Error(`Resend rejected OTP delivery: ${error.message}`)
  }
}

class TestEmailSender implements EmailSender {
  async sendOtp() {}
}

export function getEmailSender(): EmailSender {
  const config = getConfig()
  return config.localAuthAdaptersEnabled
    ? new TestEmailSender()
    : new ResendEmailSender()
}
