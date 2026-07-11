import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import Database from "better-sqlite3"

import type { TestDatabase } from "./helpers/test-database"
import { createTestDatabase } from "./helpers/test-database"
import { withSqliteBusyRetry } from "@/lib/transactions"

let database: TestDatabase

before(async () => {
  database = await createTestDatabase("busy-retry")
})

after(async () => {
  await database.close()
})

test("SQLITE_BUSY is retried and succeeds after the writer releases its lock", async () => {
  await database.client.$queryRawUnsafe("PRAGMA busy_timeout = 0")
  const locker = new Database(database.filePath)
  locker.pragma("journal_mode = WAL")
  locker.exec("BEGIN IMMEDIATE")
  const release = setTimeout(() => locker.exec("COMMIT"), 35)

  try {
    const user = await withSqliteBusyRetry(
      () => database.client.user.create({ data: {} }),
      { maxRetries: 4, baseDelayMs: 20 }
    )
    assert.ok(user.id)
  } finally {
    clearTimeout(release)
    if (locker.inTransaction) {
      locker.exec("ROLLBACK")
    }
    locker.close()
  }
})
