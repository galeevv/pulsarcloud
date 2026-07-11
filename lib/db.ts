import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

import { PrismaClient } from "@/generated/prisma/client"
import { initializeSqliteConnection } from "@/lib/sqlite-runtime"

const databaseUrl = process.env.DATABASE_URL ?? "file:./pulsar.db"

type PrismaRuntime = {
  databaseUrl: string
  prisma: PrismaClient
  ready: ReturnType<typeof initializeSqliteConnection>
}

const globalForPrisma = globalThis as unknown as {
  pulsarPrismaRuntime?: PrismaRuntime
}

function createRuntime(): PrismaRuntime {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(
      `Pulsar requires a SQLite DATABASE_URL beginning with "file:"; received ${JSON.stringify(databaseUrl)}.`
    )
  }

  const adapter = new PrismaBetterSqlite3({ url: databaseUrl })
  const prisma = new PrismaClient({ adapter })

  return {
    databaseUrl,
    prisma,
    ready: initializeSqliteConnection(prisma),
  }
}

function getRuntime() {
  const existing = globalForPrisma.pulsarPrismaRuntime

  if (existing && existing.databaseUrl === databaseUrl) {
    return existing
  }

  const runtime = createRuntime()

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pulsarPrismaRuntime = runtime
  }

  return runtime
}

const runtime = getRuntime()

export const prisma = runtime.prisma
export const sqliteReady = runtime.ready

await sqliteReady

export function getPrismaClient() {
  return prisma
}
