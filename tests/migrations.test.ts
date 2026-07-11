import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import type { TestDatabase } from "./helpers/test-database"
import { createTestDatabase } from "./helpers/test-database"

let database: TestDatabase

before(async () => {
  database = await createTestDatabase("migrations")
})

after(async () => {
  await database.close()
})

test("baseline migration builds every foundation table from an empty database", async () => {
  const rows = await database.client.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  )
  const names = new Set(rows.map((row) => row.name))
  const expected = [
    "User",
    "AuthIdentity",
    "AuthChallenge",
    "Session",
    "PricingVersion",
    "PriceQuote",
    "Payment",
    "PaymentWebhookEvent",
    "Subscription",
    "SubscriptionPeriod",
    "ReferralProfile",
    "ReferralInvite",
    "ReferralReward",
    "WalletLedgerEntry",
    "PayoutRequest",
    "SupportConversation",
    "SupportMessage",
    "TelegramUpdate",
    "Job",
    "AuditEvent",
  ]

  for (const table of expected) {
    assert.equal(names.has(table), true, `missing table ${table}`)
  }
  assert.equal(names.has("_prisma_migrations"), true)
})
