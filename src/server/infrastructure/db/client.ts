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

type ErrorRecord = Record<string, unknown>

function asErrorRecord(value: unknown): ErrorRecord | null {
  return typeof value === "object" && value !== null
    ? (value as ErrorRecord)
    : null
}

function hasSqliteBusyMarker(
  value: unknown,
  visited = new Set<object>(),
  depth = 0
): boolean {
  const error = asErrorRecord(value)
  if (!error || depth > 6 || visited.has(error)) return false
  visited.add(error)

  const codes = [error.code, error.originalCode]
  if (
    codes.some(
      (code) => typeof code === "string" && /^SQLITE_BUSY(?:_|$)/i.test(code)
    )
  ) {
    return true
  }

  const messages = [error.message, error.originalMessage]
  if (
    messages.some(
      (message) =>
        typeof message === "string" &&
        /\bSQLITE_BUSY(?:_[A-Z_]+)?\b|database (?:table )?is locked/i.test(
          message
        )
    )
  ) {
    return true
  }

  const meta = asErrorRecord(error.meta)
  return (
    hasSqliteBusyMarker(error.cause, visited, depth + 1) ||
    hasSqliteBusyMarker(meta?.driverAdapterError, visited, depth + 1)
  )
}

export function isSqliteBusyError(error: unknown): boolean {
  const record = asErrorRecord(error)
  if (record?.code === "P2034") return true
  return hasSqliteBusyMarker(error)
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
      if (!isSqliteBusyError(error) || attempt === maxAttempts - 1) throw error
      await new Promise((resolve) =>
        setTimeout(resolve, 25 * 2 ** attempt + Math.floor(Math.random() * 20))
      )
    }
  }
  throw lastError
}
