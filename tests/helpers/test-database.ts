import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import Database from "better-sqlite3"

import { PrismaClient } from "@/generated/prisma/client"
import { initializeSqliteConnection } from "@/lib/sqlite-runtime"

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)
const prismaCli = path.join(workspaceRoot, "node_modules/prisma/build/index.js")

export type TestDatabase = {
  client: PrismaClient
  filePath: string
  url: string
  close(): Promise<void>
}

export async function createTestDatabase(
  suiteName: string
): Promise<TestDatabase> {
  const directory = mkdtempSync(
    path.join(tmpdir(), `pulsar-${slug(suiteName)}-`)
  )
  const filePath = path.join(directory, "suite.db")
  const url = `file:${filePath.replaceAll("\\", "/")}`

  // Prisma's Windows schema engine expects the empty SQLite file to exist.
  new Database(filePath).close()
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: workspaceRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  })

  const adapter = new PrismaBetterSqlite3({ url })
  const client = new PrismaClient({ adapter })
  await initializeSqliteConnection(client)

  return {
    client,
    filePath,
    url,
    async close() {
      await client.$disconnect()
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

export async function createPricingVersion(client: PrismaClient, version = 1) {
  const data = {
    status: "ACTIVE" as const,
    baseMonthlyPriceRub: 119,
    extraDeviceMonthlyPriceRub: 15,
    minDeviceLimit: 1,
    maxDeviceLimit: 5,
    lteMonthlyPriceRub: 50,
    durationDiscounts: [
      { months: 1, discountPct: 0 },
      { months: 3, discountPct: 10 },
      { months: 6, discountPct: 15 },
      { months: 12, discountPct: 30 },
    ],
    referralFriendDiscountPct: 50,
    referralRewardRub: 75,
    minimalPayoutRub: 150,
    effectiveAt: new Date(),
  }
  const existing = await client.pricingVersion.findUnique({
    where: { version },
  })

  if (existing) {
    return client.pricingVersion.update({
      where: { id: existing.id },
      data,
    })
  }

  return client.pricingVersion.create({
    data: {
      version,
      ...data,
    },
  })
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30)
}
