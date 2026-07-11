import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import type { TestDatabase } from "./helpers/test-database"
import { createTestDatabase } from "./helpers/test-database"

let database: TestDatabase

before(async () => {
  database = await createTestDatabase("singleton")
  process.env.DATABASE_URL = database.url
})

after(async () => {
  await database.close()
})

test("application exports one Prisma client instance", async () => {
  const databaseModule = await import("@/lib/db")
  const runtime = await databaseModule.sqliteReady

  assert.strictEqual(databaseModule.prisma, databaseModule.getPrismaClient())
  assert.deepEqual(
    {
      journalMode: runtime.journalMode,
      foreignKeys: runtime.foreignKeys,
      synchronous: runtime.synchronous,
      busyTimeout: runtime.busyTimeout,
      tempStore: runtime.tempStore,
    },
    {
      journalMode: "wal",
      foreignKeys: 1,
      synchronous: 2,
      busyTimeout: 5000,
      tempStore: 2,
    }
  )
  await databaseModule.prisma.$disconnect()
})
