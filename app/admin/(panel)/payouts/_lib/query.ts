import "server-only"

import type { Prisma } from "@/src/generated/prisma/client"

import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

import type { PayoutFilter } from "./filters"

const PAGE_SIZE = 25

function monthStart(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function statusForFilter(filter: PayoutFilter) {
  if (filter === "approved") return "APPROVED" as const
  if (filter === "paid") return "PAID" as const
  if (filter === "rejected") return "REJECTED" as const
  return "PENDING" as const
}

function identityView(user: {
  identities: Array<{
    emailNormalized: string | null
    telegramUsername: string | null
  }>
  telegramProfile: { username: string | null } | null
}) {
  return {
    telegramUsername:
      user.telegramProfile?.username ??
      user.identities.find((identity) => identity.telegramUsername)
        ?.telegramUsername ??
      null,
    email:
      user.identities.find((identity) => identity.emailNormalized)
        ?.emailNormalized ?? null,
  }
}

export async function getAdminPayoutsView(input: {
  filter: PayoutFilter
  page: number
}) {
  await requireWebSession("ADMIN")
  const now = new Date()
  const testMode = getConfig().testMode
  const userScope: Prisma.UserWhereInput = {
    role: "USER",
    isTest: testMode,
  }
  const where: Prisma.PayoutRequestWhereInput = {
    status: statusForFilter(input.filter),
    user: { is: userScope },
  }

  const [pending, reserved, paidThisMonth, rejected, total] = await Promise.all(
    [
      db.payoutRequest.count({
        where: { status: "PENDING", user: { is: userScope } },
      }),
      db.payoutRequest.aggregate({
        where: {
          status: { in: ["PENDING", "APPROVED"] },
          user: { is: userScope },
        },
        _sum: { amountMinor: true },
      }),
      db.payoutRequest.aggregate({
        where: {
          status: "PAID",
          updatedAt: { gte: monthStart(now) },
          user: { is: userScope },
        },
        _sum: { amountMinor: true },
      }),
      db.payoutRequest.count({
        where: { status: "REJECTED", user: { is: userScope } },
      }),
      db.payoutRequest.count({ where }),
    ]
  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(Math.max(1, input.page), totalPages)
  const payouts = await db.payoutRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      amountMinor: true,
      payoutDetailsMasked: true,
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
      pending,
      reservedMinor: reserved._sum.amountMinor ?? 0,
      paidThisMonthMinor: paidThisMonth._sum.amountMinor ?? 0,
      rejected,
    },
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    payouts: payouts.map((payout) => ({
      ...payout,
      ...identityView(payout.user),
    })),
  }
}

export async function getAdminPayoutDetail(id: string) {
  await requireWebSession("ADMIN")
  const testMode = getConfig().testMode
  const payout = await db.payoutRequest.findFirst({
    where: {
      id,
      user: { is: { role: "USER", isTest: testMode } },
    },
    select: {
      id: true,
      amountMinor: true,
      payoutDetailsMasked: true,
      status: true,
      reviewedAt: true,
      rejectionReason: true,
      createdAt: true,
      reviewedBy: {
        select: {
          identities: {
            select: {
              emailNormalized: true,
              telegramUsername: true,
            },
          },
          telegramProfile: { select: { username: true } },
        },
      },
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
          wallet: {
            select: {
              availableMinor: true,
              reservedMinor: true,
            },
          },
          referralProfile: {
            select: {
              inviteCode: true,
            },
          },
          _count: {
            select: {
              sentInvites: true,
            },
          },
        },
      },
    },
  })
  if (!payout) return null

  const [paidReferrals, auditLogs] = await Promise.all([
    db.referralInvite.count({
      where: {
        inviterUserId: payout.user.id,
        status: "PAID",
      },
    }),
    db.auditLog.findMany({
      where: {
        entityType: "PayoutRequest",
        entityId: payout.id,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ])

  return {
    ...payout,
    ...identityView(payout.user),
    reviewer: payout.reviewedBy ? identityView(payout.reviewedBy) : null,
    paidReferrals,
    auditLogs,
  }
}
