import type { Prisma, PrismaClient } from "@/generated/prisma/client"

export type BusyRetryOptions = {
  maxRetries?: number
  baseDelayMs?: number
}

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BASE_DELAY_MS = 25

export async function withSqliteBusyRetry<T>(
  operation: () => Promise<T>,
  options: BusyRetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt >= maxRetries) {
        throw error
      }

      await delay(baseDelayMs * 2 ** attempt)
    }
  }
}

export function runInTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: BusyRetryOptions
) {
  // Keep this callback database-only. External HTTP calls belong before the
  // transaction or in a durable Job processed after commit.
  return withSqliteBusyRetry(
    () => prisma.$transaction(operation, { timeout: 5_000 }),
    options
  )
}

export function isSqliteBusyError(error: unknown) {
  const candidate = error as {
    code?: unknown
    message?: unknown
    meta?: { code?: unknown }
  }
  const code =
    typeof candidate.code === "string"
      ? candidate.code
      : typeof candidate.meta?.code === "string"
        ? candidate.meta.code
        : ""
  const message =
    typeof candidate.message === "string" ? candidate.message : ""

  return (
    code === "SQLITE_BUSY" ||
    code === "SQLITE_BUSY_SNAPSHOT" ||
    code === "P1008" ||
    code === "P2034" ||
    /SQLITE_BUSY|database is locked|database table is locked/i.test(message)
  )
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
