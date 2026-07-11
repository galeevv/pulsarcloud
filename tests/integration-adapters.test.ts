import assert from "node:assert/strict"
import test from "node:test"

import { openJobPayload, sealJobPayload } from "@/lib/job-payload-crypto"
import { sendTransactionalEmail } from "@/src/server/services/email/resend-client"
import { PlategaPaymentProvider } from "@/src/server/services/payments/provider"
import { HttpRemnawaveClient } from "@/src/server/services/remnawave/client"
import { sendTelegramMessage } from "@/src/server/services/telegram/bot-client"

test("Resend adapter sends the production OTP envelope idempotently", async () => {
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }
  let request: { headers?: HeadersInit; body?: BodyInit | null } | undefined
  try {
    process.env.RESEND_API_KEY = "resend-test-key"
    process.env.EMAIL_FROM = "Pulsar <auth@pulsar-cloud.space>"
    globalThis.fetch = async (_input, init) => {
      request = init
      return Response.json({ id: "email-1" })
    }

    await sendTransactionalEmail({
      idempotencyKey: "auth-email/challenge-1",
      to: "user@example.com",
      subject: "Вход в Pulsar",
      text: "Код: 123456",
      html: "<p>Код: 123456</p>",
    })

    const headers = new Headers(request?.headers)
    const body = JSON.parse(String(request?.body)) as {
      from: string
      to: string[]
    }
    assert.equal(headers.get("authorization"), "Bearer resend-test-key")
    assert.equal(headers.get("idempotency-key"), "auth-email/challenge-1")
    assert.equal(body.from, "Pulsar <auth@pulsar-cloud.space>")
    assert.deepEqual(body.to, ["user@example.com"])
  } finally {
    globalThis.fetch = originalFetch
    process.env = originalEnv
  }
})

test("Telegram adapter sends a login completion button", async () => {
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }
  let requestBody: unknown
  try {
    process.env.TELEGRAM_BOT_TOKEN = "telegram-test-token"
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body))
      return Response.json({ ok: true })
    }

    await sendTelegramMessage("123", "Вход подтверждён", {
      buttonText: "Войти",
      buttonUrl: "https://pulsar-cloud.space/auth/telegram/complete?token=x",
    })

    assert.deepEqual(requestBody, {
      chat_id: "123",
      text: "Вход подтверждён",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Войти",
              url: "https://pulsar-cloud.space/auth/telegram/complete?token=x",
            },
          ],
        ],
      },
    })
  } finally {
    globalThis.fetch = originalFetch
    process.env = originalEnv
  }
})

test("Platega adapter creates an SBP payment from backend input", async () => {
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }
  let requestBody: unknown
  try {
    process.env.PLATEGA_MERCHANT_ID = "merchant-test"
    process.env.PLATEGA_SECRET = "secret-test"
    process.env.NEXT_PUBLIC_APP_URL = "https://app.pulsar-cloud.space"
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body))
      return Response.json({
        transactionId: "3fa85f64-5717-4562-b3fc-2c463f66afa6",
        redirect: "https://pay.platega.io/test",
      })
    }

    const created = await new PlategaPaymentProvider().createPayment({
      paymentId: "payment-1",
      userId: "user-1",
      amountRub: 249,
      currency: "RUB",
      description: "Pulsar",
      idempotencyKey: "payment:key",
    })

    assert.equal(created.checkoutUrl, "https://pay.platega.io/test")
    assert.deepEqual(requestBody, {
      paymentMethod: 2,
      paymentDetails: { amount: 249, currency: "RUB" },
      description: "Pulsar",
      return: "https://app.pulsar-cloud.space/subscription?payment=success",
      failedUrl: "https://app.pulsar-cloud.space/subscription?payment=failed",
      payload: "payment-1",
      metadata: { userId: "user-1" },
    })
  } finally {
    globalThis.fetch = originalFetch
    process.env = originalEnv
  }
})

test("Platega callback credentials and confirmed status are normalized", async () => {
  const originalEnv = { ...process.env }
  try {
    process.env.PLATEGA_MERCHANT_ID = "merchant-test"
    process.env.PLATEGA_SECRET = "secret-test"
    const rawBody = JSON.stringify({
      id: "3fa85f64-5717-4562-b3fc-2c463f66afa6",
      amount: 249,
      currency: "RUB",
      status: "CONFIRMED",
      paymentMethod: 2,
    })
    const event = await new PlategaPaymentProvider().verifyWebhook({
      rawBody,
      headers: new Headers({
        "x-merchantid": "merchant-test",
        "x-secret": "secret-test",
      }),
    })
    assert.equal(event.eventType, "SUCCEEDED")
    assert.equal(event.amountRub, 249)
  } finally {
    process.env = originalEnv
  }
})

test("Remnawave adapter reuses a deterministic user and applies paid squads", async () => {
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }
  const requests: Array<{ url: string; method: string; body?: unknown }> = []
  try {
    process.env.REMNAWAVE_BASE_URL = "https://panel.example.test"
    process.env.REMNAWAVE_API_TOKEN = "token-test"
    process.env.REMNAWAVE_STANDARD_SQUAD_UUID =
      "11111111-1111-4111-8111-111111111111"
    process.env.REMNAWAVE_LTE_SQUAD_UUID =
      "22222222-2222-4222-8222-222222222222"
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      requests.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (requests.length === 1) return new Response(null, { status: 404 })
      return Response.json({
        response: {
          uuid: "aaaaaaaa-aaaa-5aaa-aaaa-aaaaaaaaaaaa",
          subscriptionUrl: "https://sub.example.test/short",
        },
      })
    }

    await new HttpRemnawaveClient().createOrUpdateUser({
      userId: "pulsar-user",
      email: "user@example.test",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      deviceLimit: 3,
      lteEnabled: true,
    })

    assert.equal(requests[1]?.method, "POST")
    assert.deepEqual(
      (requests[1]?.body as { activeInternalSquads: string[] })
        .activeInternalSquads,
      [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ]
    )
  } finally {
    globalThis.fetch = originalFetch
    process.env = originalEnv
  }
})

test("outbox delivery secrets are encrypted and authenticated", () => {
  const originalEnv = { ...process.env }
  try {
    process.env.JOB_PAYLOAD_SECRET =
      "a-test-secret-that-is-longer-than-32-characters"
    const sealed = sealJobPayload({ code: "123456" })
    assert.equal(openJobPayload<{ code: string }>(sealed).code, "123456")
    assert.throws(() =>
      openJobPayload({ ...sealed, ciphertext: `${sealed.ciphertext}A` })
    )
  } finally {
    process.env = originalEnv
  }
})
