import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"

const DAY_MS = 86_400_000

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

function parseHeartbeat(valueJson: string | undefined) {
  if (!valueJson) return null
  try {
    const value = JSON.parse(valueJson) as { at?: string }
    if (!value.at) return null
    const date = new Date(value.at)
    return Number.isFinite(date.getTime()) ? date : null
  } catch {
    return null
  }
}

export async function getAdminDashboardView() {
  const now = new Date()
  const weekStart = new Date(now.getTime() - 7 * DAY_MS)
  const dayStart = new Date(now.getTime() - DAY_MS)
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
    pendingPayments,
    pendingPayouts,
    openSupportConversations,
    failedJobs,
    pendingJobs,
    failedSubscriptionSyncs,
    manualReferralReviews,
    fulfillmentReviews,
    refundReviews,
    telegramProfiles,
    reachableTelegramProfiles,
    newsSubscribers,
    failedTelegramDeliveries,
    workerState,
    outboxState,
    recentUsers,
    recentPayments,
    recentAdminActions,
    topReferrerCounts,
  ] = await Promise.all([
    db.user.count({ where: { role: "USER" } }),
    db.user.count({
      where: { role: "USER", createdAt: { gte: weekStart } },
    }),
    db.user.count({
      where: {
        role: "USER",
        createdAt: { gte: previousWeekStart, lt: weekStart },
      },
    }),
    db.subscription.count({
      where: { status: "ACTIVE", expiresAt: { gt: now } },
    }),
    db.subscription.count({
      where: { status: "TRIAL", expiresAt: { gt: now } },
    }),
    db.payment.aggregate({
      where: { status: "CONFIRMED", confirmedAt: { gte: monthStart } },
      _sum: { amountMinor: true },
    }),
    db.payment.aggregate({
      where: {
        status: "CONFIRMED",
        confirmedAt: {
          gte: previousMonthStart,
          lt: previousMonthComparableEnd,
        },
      },
      _sum: { amountMinor: true },
    }),
    db.payment.count({ where: { status: { in: ["CREATED", "PENDING"] } } }),
    db.payoutRequest.count({
      where: { status: { in: ["PENDING", "APPROVED"] } },
    }),
    db.supportConversation.findMany({
      where: { status: "OPEN" },
      select: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { authorRole: true },
        },
      },
    }),
    db.outboxJob.count({ where: { status: { in: ["FAILED", "DEAD"] } } }),
    db.outboxJob.count({
      where: { status: { in: ["PENDING", "PROCESSING"] } },
    }),
    db.subscription.count({
      where: { syncStatus: "FAILED", expiresAt: { gt: now } },
    }),
    db.referralReward.count({ where: { status: "MANUAL_REVIEW" } }),
    db.payment.count({
      where: {
        status: "CONFIRMED",
        subscriptionEvents: {
          some: { type: "PAYMENT_FULFILLMENT_REVIEW_REQUIRED" },
          none: {
            type: {
              in: [
                "PAYMENT_FULFILLMENT_RESOLVED_STAGED_PLAN",
                "PAYMENT_FULFILLMENT_REFUND_REQUIRED",
              ],
            },
          },
        },
      },
    }),
    db.payment.count({
      where: {
        status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] },
        subscriptionEvents: {
          some: { type: "REFUND_REVIEW_REQUIRED" },
          none: {
            type: {
              in: ["REFUND_REVIEW_SUSPENDED", "REFUND_REVIEW_KEPT_ACTIVE"],
            },
          },
        },
      },
    }),
    db.telegramProfile.count(),
    db.telegramProfile.count({
      where: { canReceiveMessages: true, chatId: { not: null } },
    }),
    db.telegramProfile.count({
      where: {
        canReceiveMessages: true,
        chatId: { not: null },
        newsNotificationsEnabled: true,
      },
    }),
    db.telegramBroadcastDelivery.count({
      where: {
        status: "FAILED",
        broadcast: { createdAt: { gte: dayStart } },
      },
    }),
    db.systemState.findUnique({ where: { key: "worker_heartbeat" } }),
    db.outboxJob.groupBy({ by: ["status"], _count: { _all: true } }),
    db.user.findMany({
      where: { role: "USER" },
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
    db.auditLog.findMany({
      where: { actorType: "ADMIN" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    }),
    db.referralInvite.groupBy({
      by: ["inviterUserId"],
      _count: { _all: true },
      orderBy: { _count: { inviterUserId: "desc" } },
      take: 5,
    }),
  ])

  const topReferrerIds = topReferrerCounts.map(
    (referrer) => referrer.inviterUserId
  )
  const topReferrerUsers = await db.user.findMany({
    where: { id: { in: topReferrerIds }, role: "USER" },
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

  const workerHeartbeatAt = parseHeartbeat(workerState?.valueJson)
  const workerReady = Boolean(
    workerHeartbeatAt &&
    now.getTime() - workerHeartbeatAt.getTime() <
      Math.max(60_000, config.worker.pollIntervalMs * 10)
  )
  const openSupport = openSupportConversations.filter(
    (conversation) => conversation.messages[0]?.authorRole === "USER"
  ).length
  const manualReviews =
    manualReferralReviews + fulfillmentReviews + refundReviews
  const attentionTotal =
    pendingPayouts +
    openSupport +
    failedJobs +
    failedSubscriptionSyncs +
    manualReviews
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
      failedJobs,
      failedSubscriptionSyncs,
      manualReviews,
    },
    system: {
      workerReady,
      workerHeartbeatAt,
      pendingJobs,
      failedJobs,
      pendingPayments,
      outbox: Object.fromEntries(
        outboxState.map((item) => [item.status, item._count._all])
      ),
      remnawaveProvider: config.remnawave.provider,
      billingEnabled: config.payments.enabled,
      telegramProfiles,
      reachableTelegramProfiles,
      newsSubscribers,
      failedTelegramDeliveries,
    },
    topReferrers,
    activities,
  }
}
