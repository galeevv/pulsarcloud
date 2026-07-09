import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"

export const DATABASE_SETUP_MESSAGE =
  "База данных не готова. Запустите Postgres, затем npm run db:migrate и npm run db:seed."

export async function ensureDatabaseReady() {
  try {
    await prisma.loginChallenge.findFirst({
      select: {
        id: true,
      },
    })

    return null
  } catch (error) {
    if (isDatabaseReadinessError(error)) {
      return DATABASE_SETUP_MESSAGE
    }

    throw error
  }
}

function isDatabaseReadinessError(error: unknown) {
  return (
    isDatabaseSetupError(error) ||
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  )
}

export function isDatabaseSetupError(error: unknown) {
  const maybePrismaError = error as {
    code?: unknown
    message?: unknown
    name?: unknown
  }
  const code =
    typeof maybePrismaError.code === "string" ? maybePrismaError.code : null

  if (
    code &&
    ["P1000", "P1001", "P1003", "P1010", "P2021", "P2022"].includes(code)
  ) {
    return true
  }

  if (
    maybePrismaError.name === "PrismaClientInitializationError" ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    return true
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1000", "P1001", "P1003", "P1010", "P2021", "P2022"].includes(
      error.code
    )
  }

  const message =
    typeof maybePrismaError.message === "string"
      ? maybePrismaError.message
      : error instanceof Error
        ? error.message
        : ""

  if (
    /authentication failed|password authentication failed|does not exist|connect|connection|schema engine|table .* not found|relation .* does not exist/i.test(
      message
    )
  ) {
    return true
  }

  return false
}
