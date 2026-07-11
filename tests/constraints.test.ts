import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import type { TestDatabase } from "./helpers/test-database"
import { createPricingVersion, createTestDatabase } from "./helpers/test-database"

let database: TestDatabase

before(async () => {
  database = await createTestDatabase("constraints")
})

after(async () => {
  await database.close()
})

test("AuthIdentity enforces provider subject and per-user provider uniqueness", async () => {
  const first = await database.client.user.create({ data: {} })
  const second = await database.client.user.create({ data: {} })
  await database.client.authIdentity.create({
    data: {
      userId: first.id,
      provider: "EMAIL",
      providerSubject: "first@example.com",
    },
  })

  await assert.rejects(
    database.client.authIdentity.create({
      data: {
        userId: second.id,
        provider: "EMAIL",
        providerSubject: "first@example.com",
      },
    })
  )
  await assert.rejects(
    database.client.authIdentity.create({
      data: {
        userId: first.id,
        provider: "EMAIL",
        providerSubject: "other@example.com",
      },
    })
  )
})

test("idempotency and partial unique constraints are enforced", async () => {
  const user = await database.client.user.create({ data: {} })
  await database.client.walletLedgerEntry.create({
    data: {
      userId: user.id,
      direction: "CREDIT",
      amountRub: 10,
      type: "ADMIN_ADJUSTMENT",
      idempotencyKey: "same-key",
    },
  })
  await assert.rejects(
    database.client.walletLedgerEntry.create({
      data: {
        userId: user.id,
        direction: "CREDIT",
        amountRub: 10,
        type: "ADMIN_ADJUSTMENT",
        idempotencyKey: "same-key",
      },
    })
  )

  await createPricingVersion(database.client)
  await assert.rejects(createPricingVersion(database.client, 2))
})

test("database CHECK constraints reject invalid monetary values", async () => {
  const user = await database.client.user.create({ data: {} })
  await assert.rejects(
    database.client.walletLedgerEntry.create({
      data: {
        userId: user.id,
        direction: "CREDIT",
        amountRub: 0,
        type: "ADMIN_ADJUSTMENT",
        idempotencyKey: "zero-amount",
      },
    })
  )
})
