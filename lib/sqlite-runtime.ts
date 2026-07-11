import type { PrismaClient } from "@/generated/prisma/client"

export const SQLITE_BUSY_TIMEOUT_MS = 5_000

export type SqliteVersion = {
  major: number
  minor: number
  patch: number
  raw: string
}

export function parseSqliteVersion(raw: string): SqliteVersion {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw)

  if (!match) {
    throw new Error(`Unable to parse SQLite version ${JSON.stringify(raw)}.`)
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw,
  }
}

export function containsWalResetFix(version: SqliteVersion) {
  if (version.major > 3) {
    return true
  }

  if (version.major < 3) {
    return false
  }

  if (version.minor > 51) {
    return true
  }

  if (version.minor === 51) {
    return version.patch >= 3
  }

  // Official SQLite backports containing the WAL-reset fix.
  return (
    (version.minor === 50 && version.patch >= 7) ||
    (version.minor === 44 && version.patch >= 6)
  )
}

export async function initializeSqliteConnection(prisma: PrismaClient) {
  const versions = await prisma.$queryRawUnsafe<Array<{ version: string }>>(
    "SELECT sqlite_version() AS version"
  )
  const version = parseSqliteVersion(versions[0]?.version ?? "unknown")

  if (!containsWalResetFix(version)) {
    throw new Error(
      `Unsafe SQLite ${version.raw}: Pulsar uses WAL with a web process and a worker. ` +
        "SQLite must include the WAL-reset corruption fix (3.51.3+, or official backports 3.50.7/3.44.6). " +
        "Upgrade better-sqlite3 before starting Pulsar."
    )
  }

  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL")
  await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON")
  await prisma.$queryRawUnsafe("PRAGMA synchronous = FULL")
  await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`)
  await prisma.$queryRawUnsafe("PRAGMA temp_store = MEMORY")

  const [journalMode, foreignKeys, synchronous, busyTimeout, tempStore] =
    await Promise.all([
      readPragma(prisma, "journal_mode"),
      readPragma(prisma, "foreign_keys"),
      readPragma(prisma, "synchronous"),
      readPragma(prisma, "busy_timeout"),
      readPragma(prisma, "temp_store"),
    ])

  const actual = {
    journalMode: String(journalMode).toLowerCase(),
    foreignKeys: Number(foreignKeys),
    synchronous: Number(synchronous),
    busyTimeout: Number(busyTimeout),
    tempStore: Number(tempStore),
  }

  if (
    actual.journalMode !== "wal" ||
    actual.foreignKeys !== 1 ||
    actual.synchronous !== 2 ||
    actual.busyTimeout !== SQLITE_BUSY_TIMEOUT_MS ||
    actual.tempStore !== 2
  ) {
    throw new Error(
      `SQLite startup configuration failed: ${JSON.stringify(actual)}.`
    )
  }

  return { version: version.raw, ...actual }
}

async function readPragma(prisma: PrismaClient, name: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `PRAGMA ${name}`
  )

  return Object.values(rows[0] ?? {})[0]
}
