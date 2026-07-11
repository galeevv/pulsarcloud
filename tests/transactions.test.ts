import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import type { TestDatabase } from "./helpers/test-database"
import { createTestDatabase } from "./helpers/test-database"
import { runInTransaction } from "@/lib/transactions"

let database: TestDatabase

before(async () => {
  database = await createTestDatabase("transactions")
})

after(async () => {
  await database.close()
})

test("transaction rolls back every write when the callback fails", async () => {
  await assert.rejects(
    runInTransaction(database.client, async (tx) => {
      await tx.user.create({ data: { id: "must-rollback" } })
      throw new Error("rollback")
    })
  )

  assert.equal(
    await database.client.user.count({ where: { id: "must-rollback" } }),
    0
  )
})
