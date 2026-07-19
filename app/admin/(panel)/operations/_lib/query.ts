import type {
  AuditLog,
  IntegrationLog,
  OutboxJob,
} from "@/src/generated/prisma/client"

import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

export type SystemTone = "positive" | "negative" | "neutral"

type EntityRef = {
  entityType: string
  entityId: string | null
}

const GLOBAL_JOB_TYPES = new Set([
  "CLEANUP_AUTH_CHALLENGES",
  "CLEANUP_SESSIONS",
  "CLEANUP_WEBHOOK_LOGS",
  "RECONCILE_PENDING_PAYMENTS",
  "RECONCILE_SUBSCRIPTIONS",
])

const ENVIRONMENT_ENTITY_TYPES = new Set([
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

const JOB_STATUS_PRIORITY: Record<OutboxJob["status"], number> = {
  DEAD: 0,
  FAILED: 1,
  PROCESSING: 2,
  PENDING: 3,
  COMPLETED: 4,
}

export async function getAdminOperationsView() {
  await requireWebSession("ADMIN")
  const config = getConfig()
  const [
    rawJobs,
    subscriptions,
    rawAuditLogs,
    workerState,
    rawRemnawaveLogs,
  ] = await Promise.all([
    db.outboxJob.findMany({
      where: {
        status: { in: ["PENDING", "PROCESSING", "FAILED", "DEAD"] },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    db.subscription.findMany({
      where: {
        user: { is: { role: "USER", isTest: config.testMode } },
        OR: [
          { syncStatus: { in: ["PENDING", "FAILED"] } },
          { status: { in: ["ACTIVE", "TRIAL"] } },
        ],
      },
      orderBy: [{ syncStatus: "asc" }, { updatedAt: "desc" }],
      take: 100,
      include: {
        user: {
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
      },
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    db.systemState.findUnique({ where: { key: "worker_heartbeat" } }),
    db.integrationLog.findMany({
      where: { integration: "remnawave" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ])

  const [scopedJobs, scopedAuditLogs, scopedRemnawaveLogs] = await Promise.all([
    filterJobsForEnvironment(rawJobs, config.testMode),
    filterAuditLogsForEnvironment(rawAuditLogs, config.testMode),
    filterIntegrationLogsForEnvironment(rawRemnawaveLogs, config.testMode),
  ])
  const jobs = [...scopedJobs]
    .sort(
      (left, right) =>
        JOB_STATUS_PRIORITY[left.status] - JOB_STATUS_PRIORITY[right.status] ||
        right.createdAt.getTime() - left.createdAt.getTime()
    )
    .slice(0, 100)
  const auditLogs = scopedAuditLogs.slice(0, 100)
  const lastRemnawaveLog = scopedRemnawaveLogs[0] ?? null

  const queuedSubscriptionIds = jobs
    .filter((job) => job.aggregateType === "Subscription")
    .map((job) => job.aggregateId)
  const queuedSubscriptions = queuedSubscriptionIds.length
    ? await db.subscription.findMany({
        where: {
          id: { in: queuedSubscriptionIds },
          user: { is: { role: "USER", isTest: config.testMode } },
        },
        select: { id: true, userId: true },
      })
    : []
  const subscriptionUserById = new Map([
    ...subscriptions.map(
      (subscription) => [subscription.id, subscription.userId] as const
    ),
    ...queuedSubscriptions.map(
      (subscription) => [subscription.id, subscription.userId] as const
    ),
  ])
  const supportMessageIds = jobs
    .filter((job) => job.aggregateType === "SupportMessage")
    .map((job) => job.aggregateId)
  const supportMessages = supportMessageIds.length
    ? await db.supportMessage.findMany({
        where: {
          id: { in: supportMessageIds },
          conversation: {
            is: {
              user: {
                is: { role: "USER", isTest: config.testMode },
              },
            },
          },
        },
        select: { id: true, conversationId: true },
      })
    : []
  const supportConversationByMessageId = new Map(
    supportMessages.map((message) => [message.id, message.conversationId])
  )

  const now = new Date()
  const heartbeatAt = parseHeartbeat(workerState?.valueJson)
  const heartbeatFreshnessMs = Math.max(
    60_000,
    config.worker.pollIntervalMs * 10
  )
  const workerFresh =
    heartbeatAt !== null &&
    now.getTime() - heartbeatAt.getTime() < heartbeatFreshnessMs
  const pending = scopedJobs.filter((job) => job.status === "PENDING").length
  const processing = scopedJobs.filter(
    (job) => job.status === "PROCESSING"
  ).length
  const failed = scopedJobs.filter((job) => job.status === "FAILED").length
  const dead = scopedJobs.filter((job) => job.status === "DEAD").length
  const failedTelegramJobs = scopedJobs.filter(
    (job) =>
      job.type.startsWith("SEND_TELEGRAM") &&
      (job.status === "FAILED" || job.status === "DEAD")
  ).length

  return {
    generatedAt: now,
    metrics: { pending, processing, failed, dead },
    jobs: jobs.map((job) => ({
      ...job,
      safeError: job.lastError ? "Ошибка выполнения задачи" : null,
      href: entityHref({
        aggregateType: job.aggregateType,
        aggregateId: job.aggregateId,
        subscriptionUserId: subscriptionUserById.get(job.aggregateId),
        supportConversationId: supportConversationByMessageId.get(
          job.aggregateId
        ),
      }),
      cancellable:
        job.status === "PENDING" &&
        [
          "SEND_TELEGRAM_NOTIFICATION",
          "SEND_TELEGRAM_BROADCAST_BATCH",
        ].includes(job.type),
      retryable: ["FAILED", "DEAD"].includes(job.status),
    })),
    subscriptions: subscriptions.map((subscription) => ({
      ...subscription,
      userLabel: userLabel(subscription.user),
    })),
    auditLogs,
    system: [
      {
        name: "Web",
        status: "Работает",
        detail: "Страница сформирована приложением",
        tone: "positive" as SystemTone,
      },
      {
        name: "Worker",
        status: workerFresh ? "Работает" : "Нет heartbeat",
        detail: heartbeatAt
          ? `Последний сигнал ${dateTime(heartbeatAt)}`
          : "Сигнал ещё не зарегистрирован",
        tone: workerFresh ? ("positive" as const) : ("negative" as const),
      },
      {
        name: "База данных",
        status: "Работает",
        detail: "Запросы страницы выполнены",
        tone: "positive" as SystemTone,
      },
      {
        name: "Remnawave",
        status:
          config.remnawave.provider === "mock"
            ? "Mock adapter"
            : lastRemnawaveLog
              ? lastRemnawaveLog.success
                ? "Последняя операция успешна"
                : "Последняя операция с ошибкой"
              : "Нет данных",
        detail: lastRemnawaveLog
          ? `Проверено ${dateTime(lastRemnawaveLog.createdAt)}`
          : "Без синхронного запроса к провайдеру",
        tone:
          config.remnawave.provider === "mock" || !lastRemnawaveLog
            ? ("neutral" as const)
            : lastRemnawaveLog.success
              ? ("positive" as const)
              : ("negative" as const),
      },
      {
        name: "Resend",
        status: config.resend.apiKey ? "Настроен" : "Не настроен",
        detail: "Состояние конфигурации без live-запроса",
        tone: config.resend.apiKey
          ? ("positive" as const)
          : ("neutral" as const),
      },
      {
        name: "Telegram",
        status:
          failedTelegramJobs > 0
            ? `${failedTelegramJobs} ошибок`
            : config.telegram.botToken
              ? "Настроен"
              : "Не настроен",
        detail: "По локальной очереди и конфигурации",
        tone:
          failedTelegramJobs > 0
            ? ("negative" as const)
            : config.telegram.botToken
              ? ("positive" as const)
              : ("neutral" as const),
      },
    ],
  }
}

async function filterJobsForEnvironment(jobs: OutboxJob[], isTest: boolean) {
  const scopedKeys = await resolveEnvironmentEntityKeys(
    jobs.map((job) => ({
      entityType: job.aggregateType,
      entityId: job.aggregateId,
    })),
    isTest
  )
  return jobs.filter(
    (job) =>
      (job.aggregateType === "System" && GLOBAL_JOB_TYPES.has(job.type)) ||
      scopedKeys.has(entityKey(job.aggregateType, job.aggregateId))
  )
}

async function filterAuditLogsForEnvironment(
  logs: AuditLog[],
  isTest: boolean
) {
  const actorIds = [
    ...new Set(logs.flatMap((log) => (log.actorId ? [log.actorId] : []))),
  ]
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds }, isTest },
        select: { id: true },
      })
    : []
  const actorSet = new Set(actors.map((actor) => actor.id))
  const entityKeys = await resolveEnvironmentEntityKeys(logs, isTest)
  return logs.filter(
    (log) => {
      if (
        log.entityId !== null &&
        ENVIRONMENT_ENTITY_TYPES.has(log.entityType)
      )
        return entityKeys.has(entityKey(log.entityType, log.entityId))
      return log.actorId !== null && actorSet.has(log.actorId)
    }
  )
}

async function filterIntegrationLogsForEnvironment(
  logs: IntegrationLog[],
  isTest: boolean
) {
  const entityKeys = await resolveEnvironmentEntityKeys(
    logs.map((log) => ({
      entityType: log.entityType ?? "",
      entityId: log.entityId,
    })),
    isTest
  )
  return logs.filter(
    (log) =>
      log.entityId !== null &&
      entityKeys.has(entityKey(log.entityType ?? "", log.entityId))
  )
}

async function resolveEnvironmentEntityKeys(
  refs: EntityRef[],
  isTest: boolean
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
          requestedByUser: { is: { isTest } },
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
  if (outboxIds.length) {
    const referencedJobs = await db.outboxJob.findMany({
      where: { id: { in: outboxIds } },
    })
    const referencedKeys = await resolveEnvironmentEntityKeys(
      referencedJobs.map((job) => ({
        entityType: job.aggregateType,
        entityId: job.aggregateId,
      })),
      isTest
    )
    for (const job of referencedJobs)
      if (
        (job.aggregateType === "System" && GLOBAL_JOB_TYPES.has(job.type)) ||
        referencedKeys.has(entityKey(job.aggregateType, job.aggregateId))
      )
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

function parseHeartbeat(value: string | undefined) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { at?: unknown }
    if (typeof parsed.at !== "string") return null
    const date = new Date(parsed.at)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

function entityHref(input: {
  aggregateType: string
  aggregateId: string
  subscriptionUserId?: string
  supportConversationId?: string
}) {
  if (input.aggregateType === "User") return `/admin/users/${input.aggregateId}`
  if (input.aggregateType === "Payment")
    return `/admin/payments?q=${encodeURIComponent(input.aggregateId)}&period=all`
  if (input.aggregateType === "PayoutRequest")
    return `/admin/payouts/${input.aggregateId}`
  if (input.aggregateType === "SupportConversation")
    return `/admin/support/${input.aggregateId}`
  if (input.aggregateType === "SupportMessage" && input.supportConversationId)
    return `/admin/support/${input.supportConversationId}`
  if (input.aggregateType === "Subscription" && input.subscriptionUserId)
    return `/admin/users/${input.subscriptionUserId}`
  if (input.aggregateType === "TelegramBroadcast") return "/admin/telegram"
  return null
}

function userLabel(user: {
  identities: Array<{
    emailNormalized: string | null
    telegramUsername: string | null
  }>
  telegramProfile: { username: string | null } | null
}) {
  const telegram =
    user.telegramProfile?.username ??
    user.identities.find((identity) => identity.telegramUsername)
      ?.telegramUsername
  if (telegram) return telegram.startsWith("@") ? telegram : `@${telegram}`
  return (
    user.identities.find((identity) => identity.emailNormalized)
      ?.emailNormalized ?? "Пользователь Pulsar"
  )
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}
