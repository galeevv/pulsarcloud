import assert from "node:assert/strict"
import test from "node:test"

import {
  classifyTelegramGatewayFailure,
  isPermanentTelegramDeliveryError,
  TelegramGatewayError,
} from "@/src/server/infrastructure/telegram/gateway"

test("Telegram gateway classifies retryable provider failures", () => {
  assert.equal(classifyTelegramGatewayFailure(429, "Too Many Requests"), "RATE_LIMITED")
  assert.equal(
    classifyTelegramGatewayFailure(502, "Bad Gateway"),
    "TRANSIENT"
  )
})

test("Telegram gateway classifies permanent delivery failures", () => {
  const unavailable = new TelegramGatewayError(
    classifyTelegramGatewayFailure(403, "Forbidden: bot was blocked by the user"),
    403
  )
  const invalidMessage = new TelegramGatewayError(
    classifyTelegramGatewayFailure(400, "Bad Request: message is too long"),
    400
  )

  assert.equal(unavailable.reason, "RECIPIENT_UNAVAILABLE")
  assert.equal(unavailable.message, "TELEGRAM_RECIPIENT_UNAVAILABLE")
  assert.equal(invalidMessage.reason, "PERMANENT_REQUEST")
  assert.equal(isPermanentTelegramDeliveryError(unavailable), true)
  assert.equal(isPermanentTelegramDeliveryError(invalidMessage), true)
  assert.equal(
    isPermanentTelegramDeliveryError(
      new TelegramGatewayError("RATE_LIMITED", 429)
    ),
    false
  )
})

test("Telegram gateway normalizes harmless replay errors", () => {
  assert.equal(
    classifyTelegramGatewayFailure(400, "Bad Request: message is not modified"),
    "MESSAGE_NOT_MODIFIED"
  )
  assert.equal(
    classifyTelegramGatewayFailure(400, "Bad Request: query is too old"),
    "CALLBACK_QUERY_EXPIRED"
  )
})
