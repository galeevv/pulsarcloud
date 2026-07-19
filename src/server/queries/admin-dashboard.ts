import type { AuditLog } from "@/src/generated/prisma/client"

import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

const DAY_MS = 86_400_000
const SCOPED_ENTITY_TYPES = new Set([
  "User",
  "Payment",
  "Subscription",
  "PayoutRequest",
  "SupportConversation",
  "SupportMessage",
  "TelegramBroadcast",
  "LoginChallenge",
  "WalletAccount",
  "OutboxJob",
])

type EntityRef = {
  entityType: string
  entityId: string | null
}

type Identity = {
  provider: string
  providerSubject: string
  emailNormalized: string | null
  telegramUsername: string | null
}

type TelegramProfileIdentity = {
  username: string | null
  firstName: string | null
  lastName: string | null
  telegramId: string
}

export type AdminDashboardActivity = {
  id: string
  kind: "user" | "payment" | "admin"
  title: string
  description: string
  occurredAt: Date
  href?: string
}

function identityLabel(
  identities: Identity[],
  telegramProfile?: TelegramProfileIdentity | null
) {
  const telegramUsername =
    telegramProfile?.username ??
    identities.find((identity) => identity.telegramUsername)?.telegramUsername
  if (telegramUsername)
    return telegramUsername.startsWith("@")
      ? telegramUsername
      : `@${telegramUsername}`

  const telegramName = [
    telegramProfile?.firstName,
    telegramProfile?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
  if (telegramName) return telegramName

  const email = identities.find(
    (identity) => identity.emailNormalized
  )?.emailNormalized
  if (email) return email

  const telegramId =
    telegramProfile?.telegramId ??
    identities.find((identity) => identity.provider === "TELEGRAM")
      ?.providerSubject
  return telegramId ? `Telegram ID ${telegramId}` : "Нет данных пользователя"
}

function emailLabel(identities: Identity[]) {
  return (
    identities.find((identity) => identity.emailNormalized)?.emailNormalized ??
    "Почта не привязана"
  )
}

function telegramLabel(identities: Identity[]) {
  const username = identities.find(
    (identity) => identity.telegramUsername
  )?.telegramUsername
  if (!username) return "Телеграм не привязан"
  return username.startsWith("@") ? username : `@${username}`
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    ADMIN_WALLET_ADJUSTED: "Скорректирован баланс пользователя",
    BROADCAST_CANCELED: "Отменена Telegram-рассылка",
    BROADCAST_DRAFT_CREATED: "Создан черновик Telegram-рассылки",
    BROADCAST_QUEUED: "Telegram-рассылка поставлена в очередь",
    JOB_RETRIED: "Задание отправлено на повтор",
    PAYOUT_PAID: "Выплата отмечена выполненной",
    PAYOUT_REJECTED: "Выплата отклонена",
    SUBSCRIPTION_EXTENDED: "Подписка изменена администратором",
    USER_SESSIONS_REVOKED: "Сессии пользователя отозваны",
    USER_STATUS_CHANGED: "Статус пользователя изменён",
  }

  return labels[action] ?? "Выполнено административное действие"
}

function formatRubMinor(amountMinor: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100)
}

export async function getAdminDashboardView() {
  await requireWebSession("ADMIN")

  const now = new Date()
  const weekStart = new Date(now.getTime() - 7 * DAY_MS)
  const previousWeekStart = new Date(now.getTime() - 14 * DAY_MS)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const previousMonthComparableEnd = new Date(
    Math.min(
      monthStart.getTime(),
      previousMonthStart.getTime() + (now.getTime() - monthStart.getTime())
    )
  )
  const config = getConfig()

  const [
    totalUsers,
    newUsersThisWeek,
    newUsersPreviousWeek,
    activeSubscriptions,
    trialSubscriptions,
    revenueThisMonth,
    revenuePreviousMonth,
    pendingPayouts,
    openSupportConversations,
    failedJobs,
    failedSubscriptionSyncs,
    recentUsers,
    recentPayments,
    recentAdminActions,
    topReferrerCounts,
  ] = await Promise.all([
    db.user.count({
      where: { role: "USER", isTest: config.testMode },
    }),
    db.user.count({
      where: {
        role: "USER",
        isTest: config.testMode,
        createdAt: { gte: weekStart },
      },
    }),
    db.user.count({
      where: {
        role: "USER",
        isTest: config.testMode,
        createdAt: { gte: previousWeekStart, lt: weekStart },
      },
    }),
    db.subscription.count({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now },
        user: {
          is: { role: "USER", isTest: config.testMode },
        },
      },
    }),
    db.subscription.count({
      where: {
        status: "TRIAL",
        expiresAt: { gt: now },
        user: {
          is: { role: "USER", isTest: config.testMode },
        },
      },
    }),
    db.payment.aggregate({
      where: {
        status: "CONFIRMED",
        confirmedAt: { gte: monthStart },
        isTest: config.testMode,
        user: {
          is: { role: "USER", isTest: config.testMode },
        },
      },
      _sum: { amountMinor: true },
    }),
    db.payment.aggregate({
      where: {
        status: "CONFIRMED",
        isTest: config.testMode,
        user: {
          is: { role: "USER", isTest: config.testMode },
        },
        confirmedAt: {
          gte: previousMonthStart,
          lt: previousMonthComparableEnd,
        },
      },
      _sum: { amountMinor: true },
    }),
    db.payoutRequest.count({
      where: {
        status: { in: ["PENDING", "APPROVED"] },
        user: {
          is: { role: "USER", isTest: config.testMode },
        },
      },
    }),
    db.supportConversation.findMany({
      where: {
        status: "OPEN",
        user: {
          is: { role: "USER", isTest: config.testMode },
        },
      },
      select: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { authorRole: true },
        },
      },
    }),
    findFailedJobsForEnvironment(config.testMode),
    db.subscription.count({
      where: {
        syncStatus: "FAILED",
        expiresAt: { gt: now },
        user: {
          is: { role: "USER", isTest: config.testMode },
        },
      },
    }),
    db.user.findMany({
      where: { role: "USER", isTest: config.testMode },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        createdAt: true,
        identities: {
          select: {
            provider: true,
            providerSubject: true,
            emailNormalized: true,
            telegramUsername: true,
          },
        },
        telegramProfile: {
          select: {
            username: true,
            firstName: true,
            lastName: true,
            telegramId: true,
          },
        },
      },
    }),
    db.payment.findMany({
      where: {
        status: { in: ["CONFIRMED", "REFUNDED", "PARTIALLY_REFUNDED"] },
        isTest: config.testMode,
        user: {
          is: { role: "USER", isTest: config.testMode },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        amountMinor: true,
        status: true,
        purpose: true,
        createdAt: true,
        confirmedAt: true,
        refundedAt: true,
        user: {
          select: {
            id: true,
            identities: {
              select: {
                provider: true,
                providerSubject: true,
                emailNormalized: true,
                telegramUsername: true,
              },
            },
            telegramProfile: {
              select: {
                username: true,
                firstName: true,
                lastName: true,
                telegramId: true,
              },
            },
          },
        },
      },
    }),
    findRecentAdminActionsForEnvironment(config.testMode, 6),
    db.referralInvite.groupBy({
      by: ["inviterUserId"],
      where: {
        inviter: {
          is: { role: "USER", isTest: config.testMode },
        },
        invited: {
          is: { role: "USER", isTest: config.testMode },
        },
      },
      _count: { _all: true },
      orderBy: { _count: { inviterUserId: "desc" } },
      take: 5,
    }),
  ])

  const topReferrerIds = topReferrerCounts.map(
    (referrer) => referrer.inviterUserId
  )
  const topReferrerUsers = await db.user.findMany({
    where: {
      id: { in: topReferrerIds },
      role: "USER",
      isTest: config.testMode,
    },
    select: {
      id: true,
      identities: {
        select: {
          provider: true,
          providerSubject: true,
          emailNormalized: true,
          telegramUsername: true,
        },
      },
    },
  })
  const topReferrerUserById = new Map(
    topReferrerUsers.map((user) => [user.id, user])
  )
  const topReferrers = topReferrerCounts.flatMap((referrer) => {
    const user = topReferrerUserById.get(referrer.inviterUserId)
    if (!user) return []

    return [
      {
        userId: user.id,
        email: emailLabel(user.identities),
        telegram: telegramLabel(user.identities),
        invites: referrer._count._all,
      },
    ]
  })

  const openSupport = openSupportConversations.filter(
    (conversation) => conversation.messages[0]?.authorRole === "USER"
  ).length
  const attentionTotal =
    pendingPayouts + openSupport + failedJobs.length + failedSubscriptionSyncs
  const adminActivityTitle = config.admin.telegramUsername
    ? config.admin.telegramUsername.startsWith("@")
      ? config.admin.telegramUsername
      : `@${config.admin.telegramUsername}`
    : config.admin.email

  const activities: AdminDashboardActivity[] = [
    ...recentUsers.map((user) => ({
      id: `user:${user.id}`,
      kind: "user" as const,
      title: identityLabel(user.identities, user.telegramProfile),
      description: "Новый пользователь",
      occurredAt: user.createdAt,
      href: `/admin/users/${user.id}`,
    })),
    ...recentPayments.map((payment) => {
      const refunded =
        payment.status === "REFUNDED" || payment.status === "PARTIALLY_REFUNDED"
      return {
        id: `payment:${payment.id}`,
        kind: "payment" as const,
        title: identityLabel(
          payment.user.identities,
          payment.user.telegramProfile
        ),
        description: `${
          refunded
            ? payment.status === "REFUNDED"
              ? "Возврат платежа"
              : "Частичный возврат"
            : payment.purpose === "DEVICE_LIMIT_UPGRADE"
              ? "Оплата дополнительного устройства"
              : "Оплата подписки"
        } · ${formatRubMinor(payment.amountMinor)}`,
        occurredAt:
          payment.refundedAt ?? payment.confirmedAt ?? payment.createdAt,
        href: `/admin/users/${payment.user.id}`,
      }
    }),
    ...recentAdminActions.map((entry) => ({
      id: `audit:${entry.id}`,
      kind: "admin" as const,
      title: adminActivityTitle,
      description: `${auditActionLabel(entry.action)} · ${entry.entityType}`,
      occurredAt: entry.createdAt,
      href:
        entry.entityType === "User" && entry.entityId
          ? `/admin/users/${entry.entityId}`
          : undefined,
    })),
  ]
    .sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()
    )
    .slice(0, 5)

  return {
    generatedAt: now,
    metrics: {
      totalUsers,
      newUsersThisWeek,
      newUsersPreviousWeek,
      activeSubscriptions,
      trialSubscriptions,
      revenueThisMonthMinor: revenueThisMonth._sum.amountMinor ?? 0,
      revenuePreviousMonthMinor: revenuePreviousMonth._sum.amountMinor ?? 0,
      attentionTotal,
    },
    attention: {
      pendingPayouts,
      openSupport,
      failedJobs: failedJobs.length,
      failedSubscriptionSyncs,
    },
    topReferrers,
    activities,
  }
}

async function findFailedJobsForEnvironment(isTest: boolean) {
  const jobs = await db.outboxJob.findMany({
    where: {
      status: { in: ["FAILED", "DEAD"] },
      NOT: {
        aggregateType: "Subscription",
        type: {
          in: ["PROVISION_SUBSCRIPTION", "RECONCILE_SUBSCRIPTION_STATE"],
        },
      },
    },
    select: {
      id: true,
      aggregateType: true,
      aggregateId: true,
    },
  })
  const scopedKeys = await resolveEnvironmentEntityKeys(
    jobs.map((job) => ({
      entityType: job.aggregateType,
      entityId: job.aggregateId,
    })),
    isTest
  )

  return jobs.filter((job) =>
    scopedKeys.has(entityKey(job.aggregateType, job.aggregateId))
  )
}

async function findRecentAdminActionsForEnvironment(
  isTest: boolean,
  limit: number
) {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isTest },
    select: { id: true },
  })
  const adminIds = admins.map((admin) => admin.id)
  if (!adminIds.length) return []

  const actions: Array<
    Pick<
      AuditLog,
      "id" | "action" | "entityType" | "entityId" | "createdAt"
    >
  > = []
  let cursor: string | undefined

  while (actions.length < limit) {
    const batch = await db.auditLog.findMany({
      where: {
        actorType: "ADMIN",
        actorId: { in: adminIds },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    })
    if (!batch.length) break

    const scopedKeys = await resolveEnvironmentEntityKeys(batch, isTest)
    for (const entry of batch) {
      if (
        entry.entityId &&
        SCOPED_ENTITY_TYPES.has(entry.entityType) &&
        scopedKeys.has(entityKey(entry.entityType, entry.entityId))
      )
        actions.push(entry)
      if (actions.length === limit) break
    }
    if (batch.length < 50) break
    cursor = batch.at(-1)?.id
  }

  return actions
}

async function resolveEnvironmentEntityKeys(
  refs: EntityRef[],
  isTest: boolean,
  depth = 0
) {
  const ids = (type: string) => [
    ...new Set(
      refs.flatMap((ref) =>
        ref.entityType === type && ref.entityId ? [ref.entityId] : []
      )
    ),
  ]
  const [
    users,
    payments,
    subscriptions,
    payouts,
    conversations,
    messages,
    broadcasts,
    challenges,
    wallets,
  ] = await Promise.all([
    findIds(ids("User"), (values) =>
      db.user.findMany({
        where: { id: { in: values }, role: "USER", isTest },
        select: { id: true },
      })
    ),
    findIds(ids("Payment"), (values) =>
      db.payment.findMany({
        where: {
          id: { in: values },
          isTest,
          user: { is: { role: "USER", isTest } },
        },
        select: { id: true },
      })
    ),
    findIds(ids("Subscription"), (values) =>
      db.subscription.findMany({
        where: {
          id: { in: values },
          user: { is: { role: "USER", isTest } },
        },
        select: { id: true },
      })
    ),
    findIds(ids("PayoutRequest"), (values) =>
      db.payoutRequest.findMany({
        where: {
          id: { in: values },
          user: { is: { role: "USER", isTest } },
        },
        select: { id: true },
      })
    ),
    findIds(ids("SupportConversation"), (values) =>
      db.supportConversation.findMany({
        where: {
          id: { in: values },
          user: { is: { role: "USER", isTest } },
        },
        select: { id: true },
      })
    ),
    findIds(ids("SupportMessage"), (values) =>
      db.supportMessage.findMany({
        where: {
          id: { in: values },
          conversation: {
            is: { user: { is: { role: "USER", isTest } } },
          },
        },
        select: { id: true },
      })
    ),
    findIds(ids("TelegramBroadcast"), (values) =>
      db.telegramBroadcast.findMany({
        where: {
          id: { in: values },
          createdBy: { is: { role: "ADMIN", isTest } },
        },
        select: { id: true },
      })
    ),
    findIds(ids("LoginChallenge"), (values) =>
      db.loginChallenge.findMany({
        where: {
          id: { in: values },
          requestedByUser: {
            is: { role: { in: ["USER", "ADMIN"] }, isTest },
          },
        },
        select: { id: true },
      })
    ),
    findIds(ids("WalletAccount"), (values) =>
      db.walletAccount.findMany({
        where: {
          id: { in: values },
          user: { is: { role: "USER", isTest } },
        },
        select: { id: true },
      })
    ),
  ])

  const keys = new Set<string>()
  for (const [type, rows] of [
    ["User", users],
    ["Payment", payments],
    ["Subscription", subscriptions],
    ["PayoutRequest", payouts],
    ["SupportConversation", conversations],
    ["SupportMessage", messages],
    ["TelegramBroadcast", broadcasts],
    ["LoginChallenge", challenges],
    ["WalletAccount", wallets],
  ] as const)
    for (const row of rows) keys.add(entityKey(type, row.id))

  const outboxIds = ids("OutboxJob")
  if (depth < 2 && outboxIds.length) {
    const jobs = await db.outboxJob.findMany({
      where: { id: { in: outboxIds } },
      select: {
        id: true,
        aggregateType: true,
        aggregateId: true,
      },
    })
    const aggregateKeys = await resolveEnvironmentEntityKeys(
      jobs.map((job) => ({
        entityType: job.aggregateType,
        entityId: job.aggregateId,
      })),
      isTest,
      depth + 1
    )
    for (const job of jobs)
      if (aggregateKeys.has(entityKey(job.aggregateType, job.aggregateId)))
        keys.add(entityKey("OutboxJob", job.id))
  }

  return keys
}

async function findIds(
  values: string[],
  query: (values: string[]) => Promise<Array<{ id: string }>>
) {
  return values.length ? query(values) : []
}

function entityKey(type: string, id: string) {
  return `${type}:${id}`
}
