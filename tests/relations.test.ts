import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import type { TestDatabase } from "./helpers/test-database"
import {
  createPricingVersion,
  createTestDatabase,
} from "./helpers/test-database"

let database: TestDatabase

before(async () => {
  database = await createTestDatabase("relations")
})

after(async () => {
  await database.close()
})

test("identity and session cascade when a user is deleted", async () => {
  const user = await database.client.user.create({ data: {} })
  await database.client.authIdentity.create({
    data: {
      userId: user.id,
      provider: "EMAIL",
      providerSubject: "cascade@example.com",
    },
  })
  await database.client.session.create({
    data: {
      userId: user.id,
      tokenHash: "cascade-token",
      expiresAt: new Date(Date.now() + 60_000),
    },
  })

  await database.client.user.delete({ where: { id: user.id } })
  assert.equal(await database.client.authIdentity.count(), 0)
  assert.equal(await database.client.session.count(), 0)
})

test("financial history restricts deletion of referenced records", async () => {
  const user = await database.client.user.create({ data: {} })
  const pricing = await createPricingVersion(database.client)
  await database.client.priceQuote.create({
    data: {
      userId: user.id,
      pricingVersionId: pricing.id,
      durationMonths: 1,
      deviceLimit: 1,
      subtotalRub: 119,
      discountRub: 0,
      totalRub: 119,
      pricingSnapshot: {},
      idempotencyKey: "restrict-quote",
      expiresAt: new Date(Date.now() + 60_000),
    },
  })

  await assert.rejects(
    database.client.pricingVersion.delete({ where: { id: pricing.id } })
  )
  await assert.rejects(database.client.user.delete({ where: { id: user.id } }))
})
