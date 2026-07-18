import type { Prisma } from "@/src/generated/prisma/client"

import { db } from "@/src/server/infrastructure/db/client"

export const ADMIN_USER_FILTERS = [
  "all",
  "active",
  "trial",
  "expired",
  "sync-failed",
  "none",
] as const

export type AdminUserFilter = (typeof ADMIN_USER_FILTERS)[number]

const PAGE_SIZE = 25

export function parseAdminUserFilter(value: string | undefined) {
  return ADMIN_USER_FILTERS.includes(value as AdminUserFilter)
    ? (value as AdminUserFilter)
    : "all"
}

export async function getAdminUsersView(input: {
  query: string
  filter: AdminUserFilter
  page: number
}) {
  const now = new Date()
  const query = input.query.trim().slice(0, 100)
  const telegramQuery = query.replace(/^@/, "")
  const where: Prisma.UserWhereInput = {
    role: "USER",
    ...(input.filter === "none"
      ? { subscription: { is: null } }
      : input.filter === "expired"
        ? { subscription: { is: { expiresAt: { lte: now } } } }
        : input.filter === "sync-failed"
          ? { subscription: { is: { syncStatus: "FAILED" } } }
          : input.filter === "active" || input.filter === "trial"
            ? {
                subscription: {
                  is: {
                    status: input.filter === "active" ? "ACTIVE" : "TRIAL",
                    expiresAt: { gt: now },
                  },
                },
              }
            : {}),
    ...(query
      ? {
          OR: [
            {
              identities: {
                some: {
                  OR: [
                    { emailNormalized: { contains: query.toLowerCase() } },
                    { telegramUsername: { contains: telegramQuery } },
                  ],
                },
              },
            },
            {
              telegramProfile: {
                is: { username: { contains: telegramQuery } },
              },
            },
          ],
        }
      : {}),
  }

  const total = await db.user.count({ where })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(Math.max(1, input.page), totalPages)
  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      identities: {
        select: {
          emailNormalized: true,
          telegramUsername: true,
        },
      },
      telegramProfile: { select: { username: true } },
      subscription: {
        select: {
          status: true,
          syncStatus: true,
          expiresAt: true,
        },
      },
      wallet: { select: { availableMinor: true } },
      _count: { select: { sentInvites: true } },
    },
  })

  return {
    generatedAt: now,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    users: users.map((user) => ({
      id: user.id,
      createdAt: user.createdAt,
      telegramUsername:
        user.telegramProfile?.username ??
        user.identities.find((identity) => identity.telegramUsername)
          ?.telegramUsername ??
        null,
      email:
        user.identities.find((identity) => identity.emailNormalized)
          ?.emailNormalized ?? null,
      subscription: user.subscription,
      balanceMinor: user.wallet?.availableMinor ?? 0,
      referrals: user._count.sentInvites,
    })),
  }
}
