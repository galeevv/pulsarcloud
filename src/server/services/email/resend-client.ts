import { z } from "zod"

import { IntegrationError } from "@/lib/application-errors"

const resendResponseSchema = z.object({ id: z.string().min(1) })

export type TransactionalEmail = {
  idempotencyKey: string
  to: string
  subject: string
  html: string
  text: string
}

export async function sendTransactionalEmail(message: TransactionalEmail) {
  const apiKey = requireEnv("RESEND_API_KEY")
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": message.idempotencyKey,
    },
    body: JSON.stringify({
      from: requireEnv("EMAIL_FROM"),
      to: [message.to],
      reply_to: process.env.EMAIL_REPLY_TO || undefined,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new IntegrationError("Resend rejected transactional email.", {
      status: response.status,
    })
  }

  const parsed = resendResponseSchema.safeParse(await response.json())
  if (!parsed.success) {
    throw new IntegrationError("Resend returned an invalid response.")
  }
  return parsed.data
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new IntegrationError(`${name} is required.`)
  }
  return value
}
