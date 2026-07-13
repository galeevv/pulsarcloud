import assert from "node:assert/strict"
import test from "node:test"

import { renderOtpEmail } from "@/src/server/infrastructure/email"

test("OTP email renders the production design and escapes dynamic values", () => {
  const html = renderOtpEmail({
    otp: "12<895",
    expiresMinutes: 5,
    magicLinkUrl:
      'https://pulsar-cloud.space/auth/verify/link?challenge=a&token="unsafe"',
  })

  assert.match(html, /Вход в аккаунт/)
  assert.match(html, /12&lt;895/)
  assert.match(html, /действуют 5 минут/)
  assert.match(html, /challenge=a&amp;token=&quot;unsafe&quot;/)
  assert.match(html, />Войти в Pulsar<\/a>/)
  assert.doesNotMatch(html, />PULSAR<|<script|onclick=/i)
})
