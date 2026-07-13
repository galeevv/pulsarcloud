import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { PrismaClient } from "@/src/generated/prisma/client"
import { getConfig } from "@/src/server/config"

const globalDatabase = globalThis as unknown as { prisma?: PrismaClient }

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: getConfig().databaseUrl })
  const client = new PrismaClient({ adapter })
  return client
}

export const db = globalDatabase.prisma ?? createClient()

if (getConfig().appEnv !== "production") globalDatabase.prisma = db

export async function initializeDatabase() {
  await db.$executeRawUnsafe("PRAGMA journal_mode = WAL")
  await db.$executeRawUnsafe("PRAGMA synchronous = FULL")
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON")
  await db.$executeRawUnsafe("PRAGMA busy_timeout = 5000")
  await db.$executeRawUnsafe("PRAGMA wal_autocheckpoint = 1000")
}

export async function databaseHealth() {
  const version = await db.$queryRawUnsafe<Array<{ version: string }>>(
    "SELECT sqlite_version() AS version"
  )
  await db.$queryRawUnsafe("SELECT 1")
  return { sqliteVersion: version[0]?.version ?? "unknown" }
}

export async function withBusyRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 4
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      const code = (error as { code?: string }).code
      const busy =
        code === "P2034" ||
        /SQLITE_BUSY|database (?:table )?is locked/i.test(message)
      if (!busy || attempt === maxAttempts - 1) throw error
      await new Promise((resolve) =>
        setTimeout(resolve, 25 * 2 ** attempt + Math.floor(Math.random() * 20))
      )
    }
  }
  throw lastError
}
