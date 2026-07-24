import "server-only"

import type { Prisma } from "@/src/generated/prisma/client"

import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

import type { PaymentFilter, PaymentPeriod, PaymentSort } from "./filters"

const PAGE_SIZE = 25

function periodStart(period: PaymentPeriod, now: Date) {
  if (period === "all") return null
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90
  return new Date(now.getTime() - days * 86_400_000)
}

function monthStart(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function statusWhere(filter: PaymentFilter): Prisma.PaymentWhereInput {
  if (filter === "successful") return { status: "CONFIRMED" }
  if (filter === "pending") return { status: { in: ["CREATED", "PENDING"] } }
  if (filter === "failed")
    return { status: { in: ["FAILED", "CANCELED", "EXPIRED"] } }
  if (filter === "refunded")
    return { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } }
  return {}
}

function orderBy(sort: PaymentSort): Prisma.PaymentOrderByWithRelationInput {
  if (sort === "oldest") return { createdAt: "asc" }
  if (sort === "amount-desc") return { amountMinor: "desc" }
  if (sort === "amount-asc") return { amountMinor: "asc" }
  return { createdAt: "desc" }
}

export async function getAdminPaymentsView(input: {
  query: string
  filter: PaymentFilter
  period: PaymentPeriod
  sort: PaymentSort
  page: number
}) {
  await requireWebSession("ADMIN")
  const now = new Date()
  const testMode = getConfig().testMode
  const userScope: Prisma.UserWhereInput = {
    role: "USER",
    isTest: testMode,
  }
  const query = input.query.trim().slice(0, 100)
  const telegramQuery = query.replace(/^@/, "")
  const start = periodStart(input.period, now)
  const where: Prisma.PaymentWhereInput = {
    isTest: testMode,
    user: { is: userScope },
    ...statusWhere(input.filter),
    ...(start ? { createdAt: { gte: start } } : {}),
    ...(query
      ? {
          OR: [
            { id: { contains: query } },
            { externalPaymentId: { contains: query } },
            {
              user: {
                is: {
                  identities: {
                    some: {
                      OR: [
                        {
                          emailNormalized: {
                            contains: query.toLowerCase(),
                          },
                        },
                        {
                          telegramUsername: {
                            contains: telegramQuery,
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
            {
              user: {
                is: {
                  telegramProfile: {
                    is: {
                      username: {
                        contains: telegramQuery,
                      },
                    },
                  },
                },
              },
            },
          ],
        }
      : {}),
  }
  const currentMonth = monthStart(now)

  const [revenue, successful, pending, failed, total] = await Promise.all([
    db.payment.aggregate({
      where: {
        isTest: testMode,
        user: { is: userScope },
        status: "CONFIRMED",
        confirmedAt: { gte: currentMonth },
      },
      _sum: { amountMinor: true },
    }),
    db.payment.count({
      where: {
        isTest: testMode,
        user: { is: userScope },
        status: "CONFIRMED",
        confirmedAt: { gte: currentMonth },
      },
    }),
    db.payment.count({
      where: {
        isTest: testMode,
        user: { is: userScope },
        status: { in: ["CREATED", "PENDING"] },
      },
    }),
    db.payment.count({
      where: {
        isTest: testMode,
        user: { is: userScope },
        status: { in: ["FAILED", "CANCELED", "EXPIRED"] },
        updatedAt: { gte: currentMonth },
      },
    }),
    db.payment.count({ where }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(Math.max(1, input.page), totalPages)
  const payments = await db.payment.findMany({
    where,
    orderBy: orderBy(input.sort),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      amountMinor: true,
      purpose: true,
      status: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          identities: {
            select: {
              emailNormalized: true,
              telegramUsername: true,
            },
          },
          telegramProfile: { select: { username: true } },
        },
      },
    },
  })

  return {
    metrics: {
      revenueThisMonthMinor: revenue._sum.amountMinor ?? 0,
      successfulThisMonth: successful,
      pending,
      failedThisMonth: failed,
    },
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    payments: payments.map((payment) => ({
      ...payment,
      telegramUsername:
        payment.user.telegramProfile?.username ??
        payment.user.identities.find((identity) => identity.telegramUsername)
          ?.telegramUsername ??
        null,
      email:
        payment.user.identities.find((identity) => identity.emailNormalized)
          ?.emailNormalized ?? null,
    })),
  }
}
