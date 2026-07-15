import { db } from "@/src/server/infrastructure/db/client"
import {
  decryptSensitive,
  correlationId,
} from "@/src/server/infrastructure/security/crypto"
import { getEmailSender } from "@/src/server/infrastructure/email"
import { getProvisioningProvider } from "@/src/server/infrastructure/remnawave/provider"
import { getTelegramGateway } from "@/src/server/infrastructure/telegram/gateway"
import { completeTelegramStart } from "@/src/server/domain/auth/service"
import { getConfig } from "@/src/server/config"
import {
  expireOverduePendingPayments,
  reconcilePaymentStatus,
} from "@/src/server/domain/billing/service"

type Job = {
  id: string
  type: string
  payloadJson: string
  attempts: number
  maxAttempts?: number
  aggregateId: string
}

const PAYMENT_POLL_DELAYS_MS = [
  60_000,
  2 * 60_000,
  5 * 60_000,
  10 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
  2 * 60 * 60_000,
]

async function applyDueSubscriptionParameters(now: Date) {
  const due = await db.subscription.findMany({
    where: {
      nextParametersAt: { lte: now },
      status: { in: ["ACTIVE", "TRIAL"] },
    },
    take: 100,
    orderBy: { nextParametersAt: "asc" },
  })
  for (const subscription of due) {
    const boundary = subscription.nextParametersAt
    if (!boundary) continue
    await db.$transaction(async (tx) => {
      const syncVersion = subscription.syncVersion + 1
      const changed = await tx.subscription.updateMany({
        where: {
          id: subscription.id,
          syncVersion: subscription.syncVersion,
          nextParametersAt: { lte: now },
        },
        data: {
          deviceLimit: subscription.nextDeviceLimit ?? subscription.deviceLimit,
          lteEnabled: subscription.nextLteEnabled ?? subscription.lteEnabled,
          nextDeviceLimit: null,
          nextLteEnabled: null,
          nextParametersAt: null,
          syncStatus: "PENDING",
          syncVersion,
          lastTechnicalError: null,
          lastUserFriendlyError: null,
        },
      })
      if (!changed.count) return
      const updated = await tx.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      })
      await tx.subscriptionEvent.upsert({
        where: {
          idempotencyKey: `subscription:${subscription.id}:parameters:${boundary.toISOString()}`,
        },
        create: {
          subscriptionId: subscription.id,
          type: "SCHEDULED_PARAMETERS_APPLIED",
          previousStateJson: JSON.stringify(subscription),
          newStateJson: JSON.stringify(updated),
          idempotencyKey: `subscription:${subscription.id}:parameters:${boundary.toISOString()}`,
        },
        update: {},
      })
      await tx.outboxJob.upsert({
        where: {
          dedupeKey: `subscription:${subscription.id}:sync:${syncVersion}`,
        },
        create: {
          type: "PROVISION_SUBSCRIPTION",
          aggregateType: "Subscription",
          aggregateId: subscription.id,
          payloadJson: JSON.stringify({
            subscriptionId: subscription.id,
            syncVersion,
          }),
          dedupeKey: `subscription:${subscription.id}:sync:${syncVersion}`,
        },
        update: {},
      })
    })
  }
}

async function ensureSubscriptionRepairJobs(now: Date) {
  const dayBucket = now.toISOString().slice(0, 10)
  const subscriptions = await db.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIAL"] },
      expiresAt: { gt: now },
      syncStatus: { in: ["PENDING", "FAILED"] },
    },
    take: 200,
    orderBy: { updatedAt: "asc" },
  })
  for (const subscription of subscriptions) {
    const jobs = await db.outboxJob.findMany({
      where: {
        type: "PROVISION_SUBSCRIPTION",
        aggregateId: subscription.id,
        status: { in: ["PENDING", "PROCESSING", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    })
    const currentJobExists = jobs.some((job) => {
      try {
        return (
          Number(
            (JSON.parse(job.payloadJson) as { syncVersion?: number })
              .syncVersion
          ) === subscription.syncVersion
        )
      } catch {
        return false
      }
    })
    if (currentJobExists) continue
    const dedupeKey = `subscription:${subscription.id}:repair:${subscription.syncVersion}:${dayBucket}`
    await db.outboxJob.upsert({
      where: { dedupeKey },
      create: {
        type: "PROVISION_SUBSCRIPTION",
        aggregateType: "Subscription",
        aggregateId: subscription.id,
        payloadJson: JSON.stringify({
          subscriptionId: subscription.id,
          syncVersion: subscription.syncVersion,
          reconciliation: true,
        }),
        dedupeKey,
      },
      update: {},
    })
  }
}

async function ensureRemoteReconciliationJobs(now: Date) {
  if (getConfig().remnawave.provider !== "http") return
  const dayBucket = now.toISOString().slice(0, 10)
  const subscriptions = await db.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIAL"] },
      expiresAt: { gt: now },
      syncStatus: "SYNCED",
      remnawaveUserId: { not: null },
    },
    take: 200,
    orderBy: { lastSyncedAt: "asc" },
  })
  for (const subscription of subscriptions) {
    const dedupeKey = `subscription:${subscription.id}:remote-reconcile:${dayBucket}`
    await db.outboxJob.upsert({
      where: { dedupeKey },
      create: {
        type: "RECONCILE_SUBSCRIPTION_STATE",
        aggregateType: "Subscription",
        aggregateId: subscription.id,
        payloadJson: JSON.stringify({ subscriptionId: subscription.id }),
        dedupeKey,
        maxAttempts: 5,
      },
      update: {},
    })
  }
}

async function ensureExpiryNotifications(now: Date) {
  const subscriptions = await db.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIAL"] },
      expiresAt: {
        gt: new Date(now.getTime() - 24 * 60 * 60_000),
        lte: new Date(now.getTime() + 72 * 60 * 60_000),
      },
    },
    take: 500,
  })
  for (const subscription of subscriptions) {
    const hours = (subscription.expiresAt.getTime() - now.getTime()) / 3_600_000
    const template =
      hours <= 0
        ? "SUBSCRIPTION_EXPIRED"
        : hours <= 24
          ? "SUBSCRIPTION_EXPIRING_1D"
          : hours > 48
            ? "SUBSCRIPTION_EXPIRING_3D"
            : null
    if (!template) continue
    const dedupeKey = `telegram:subscription:${subscription.id}:${subscription.expiresAt.toISOString()}:${template}`
    await db.outboxJob.upsert({
      where: { dedupeKey },
      create: {
        type: "SEND_TELEGRAM_NOTIFICATION",
        aggregateType: "Subscription",
        aggregateId: subscription.id,
        payloadJson: JSON.stringify({
          userId: subscription.userId,
          template,
        }),
        dedupeKey,
        maxAttempts: 5,
      },
      update: {},
    })
  }
}

async function reconcileSubscriptions() {
  const now = new Date()
  await applyDueSubscriptionParameters(now)
  await ensureSubscriptionRepairJobs(now)
  await ensureRemoteReconciliationJobs(now)
  await ensureExpiryNotifications(now)
}

async function ensurePendingPaymentReconciliation() {
  const now = new Date()
  await expireOverduePendingPayments({ now })
  const hourBucket = now.toISOString().slice(0, 13)
  const payments = await db.payment.findMany({
    where: {
      status: "PENDING",
      externalPaymentId: { not: null },
      createdAt: { gt: new Date(now.getTime() - 7 * 24 * 60 * 60_000) },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  })
  for (const payment of payments) {
    const dedupeKey = `payment:${payment.id}:maintenance:${hourBucket}`
    await db.outboxJob.upsert({
      where: { dedupeKey },
      create: {
        type: "RECONCILE_PAYMENT",
        aggregateType: "Payment",
        aggregateId: payment.id,
        payloadJson: JSON.stringify({
          paymentId: payment.id,
          pollAttempt: PAYMENT_POLL_DELAYS_MS.length,
          maintenance: true,
        }),
        dedupeKey,
        maxAttempts: 8,
      },
      update: {},
    })
  }
}

export async function handleJob(job: Job) {
  const payload = JSON.parse(job.payloadJson) as Record<string, unknown>
  if (job.type === "RECONCILE_PAYMENT") {
    const paymentId = String(payload.paymentId)
    const pollAttempt = Math.max(1, Number(payload.pollAttempt ?? 1))
    const result = await reconcilePaymentStatus(paymentId)
    if (!result.terminal && pollAttempt < PAYMENT_POLL_DELAYS_MS.length) {
      const nextAttempt = pollAttempt + 1
      const dedupeKey = `payment:${paymentId}:reconcile:${nextAttempt}`
      await db.outboxJob.upsert({
        where: { dedupeKey },
        create: {
          type: "RECONCILE_PAYMENT",
          aggregateType: "Payment",
          aggregateId: paymentId,
          payloadJson: JSON.stringify({ paymentId, pollAttempt: nextAttempt }),
          dedupeKey,
          runAfter: new Date(
            Date.now() + PAYMENT_POLL_DELAYS_MS[nextAttempt - 1]
          ),
          maxAttempts: 8,
        },
        update: {},
      })
    } else if (!result.terminal) {
      await db.integrationLog.create({
        data: {
          integration: getConfig().payments.provider,
          operation: "PAYMENT_RECONCILIATION_EXHAUSTED",
          entityType: "Payment",
          entityId: paymentId,
          success: false,
          technicalError: "Payment remained pending after bounded polling",
          correlationId: correlationId(),
        },
      })
    }
    return
  }
  if (job.type === "RECONCILE_SUBSCRIPTIONS") {
    await reconcileSubscriptions()
    return
  }
  if (job.type === "RECONCILE_PENDING_PAYMENTS") {
    await ensurePendingPaymentReconciliation()
    return
  }
  if (job.type === "RECONCILE_SUBSCRIPTION_STATE") {
    const subscriptionId = String(payload.subscriptionId)
    const subscription = await db.subscription.findUnique({
      where: { id: subscriptionId },
    })
    if (
      !subscription?.remnawaveUserId ||
      subscription.expiresAt <= new Date() ||
      !["ACTIVE", "TRIAL"].includes(subscription.status)
    )
      return
    try {
      const remote = await getProvisioningProvider().getSubscriberState(
        subscription.remnawaveUserId
      )
      const mismatch =
        Math.abs(
          remote.expiresAt.getTime() - subscription.expiresAt.getTime()
        ) > 60_000 ||
        remote.deviceLimit !== subscription.deviceLimit ||
        remote.lteEnabled !== subscription.lteEnabled
      await db.integrationLog.create({
        data: {
          integration: "remnawave",
          operation: "GET_SUBSCRIBER_STATE",
          entityType: "Subscription",
          entityId: subscription.id,
          success: true,
          attempt: job.attempts,
          responseSummary: JSON.stringify({ mismatch }),
          correlationId: correlationId(),
        },
      })
      if (!mismatch) {
        await db.subscription.updateMany({
          where: {
            id: subscription.id,
            syncVersion: subscription.syncVersion,
          },
          data: {
            lastSyncedAt: new Date(),
            ...(remote.subscriptionUrl &&
            remote.subscriptionUrl !== subscription.subscriptionUrl
              ? { subscriptionUrl: remote.subscriptionUrl }
              : {}),
          },
        })
        return
      }
      await db.$transaction(async (tx) => {
        const syncVersion = subscription.syncVersion + 1
        const changed = await tx.subscription.updateMany({
          where: { id: subscription.id, syncVersion: subscription.syncVersion },
          data: {
            syncStatus: "PENDING",
            syncVersion,
            lastTechnicalError: null,
            lastUserFriendlyError: null,
          },
        })
        if (!changed.count) return
        await tx.outboxJob.upsert({
          where: {
            dedupeKey: `subscription:${subscription.id}:sync:${syncVersion}`,
          },
          create: {
            type: "PROVISION_SUBSCRIPTION",
            aggregateType: "Subscription",
            aggregateId: subscription.id,
            payloadJson: JSON.stringify({
              subscriptionId: subscription.id,
              syncVersion,
              reconciliation: true,
            }),
            dedupeKey: `subscription:${subscription.id}:sync:${syncVersion}`,
          },
          update: {},
        })
      })
    } catch (error) {
      await db.integrationLog.create({
        data: {
          integration: "remnawave",
          operation: "GET_SUBSCRIBER_STATE",
          entityType: "Subscription",
          entityId: subscription.id,
          success: false,
          attempt: job.attempts,
          technicalError:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : String(error),
          correlationId: correlationId(),
        },
      })
      throw error
    }
    return
  }
  if (job.type === "SEND_EMAIL_OTP") {
    const challengeId = String(payload.challengeId)
    const magicLinkToken = decryptSensitive(
      String(payload.magicLinkTokenEncrypted)
    )
    await getEmailSender().sendOtp({
      to: String(payload.email),
      otp: decryptSensitive(String(payload.otpEncrypted)),
      expiresMinutes: 5,
      magicLinkUrl: `${getConfig().appUrl}/auth/verify/link?challenge=${encodeURIComponent(challengeId)}&token=${encodeURIComponent(magicLinkToken)}`,
    })
    return
  }
  if (job.type === "PROVISION_SUBSCRIPTION") {
    const subscriptionId = String(payload.subscriptionId)
    const syncVersion = Number(payload.syncVersion)
    const subscription = await db.subscription.findUnique({
      where: { id: subscriptionId },
    })
    if (!subscription || subscription.syncVersion !== syncVersion) return
    try {
      const testFailure = await db.systemState.findUnique({
        where: { key: "test_provisioning_failure" },
      })
      if (
        getConfig().testMode &&
        testFailure &&
        (JSON.parse(testFailure.valueJson) as { enabled?: boolean }).enabled
      )
        throw new Error("Simulated provisioning failure")
      const provider = getProvisioningProvider()
      const result = await provider.upsertSubscriber({
        localUserId: subscription.userId,
        expiresAt: subscription.expiresAt,
        deviceLimit: subscription.deviceLimit,
        lteEnabled: subscription.lteEnabled,
      })
      await db.$transaction(async (tx) => {
        const updated = await tx.subscription.updateMany({
          where: { id: subscription.id, syncVersion },
          data: {
            remnawaveUserId: result.remoteUserId,
            subscriptionUrl:
              subscription.subscriptionUrl ?? result.subscriptionUrl,
            syncStatus: "SYNCED",
            lastSyncedAt: new Date(),
            lastTechnicalError: null,
            lastUserFriendlyError: null,
          },
        })
        if (!updated.count) return
        await tx.integrationLog.create({
          data: {
            integration: "remnawave",
            operation: "UPSERT_SUBSCRIBER",
            entityType: "Subscription",
            entityId: subscription.id,
            success: true,
            attempt: job.attempts,
            responseSummary: JSON.stringify({
              remoteUserId: result.remoteUserId,
            }),
            correlationId: correlationId(),
          },
        })
        const dedupeKey = `telegram:subscription:${subscription.id}:provisioned:${syncVersion}`
        await tx.outboxJob.upsert({
          where: { dedupeKey },
          create: {
            type: "SEND_TELEGRAM_NOTIFICATION",
            aggregateType: "Subscription",
            aggregateId: subscription.id,
            payloadJson: JSON.stringify({
              userId: subscription.userId,
              template: "PROVISIONING_COMPLETED",
            }),
            dedupeKey,
            maxAttempts: 5,
          },
          update: {},
        })
      })
    } catch (error) {
      const technical =
        error instanceof Error ? error.message.slice(0, 1000) : String(error)
      await db.subscription.updateMany({
        where: { id: subscription.id, syncVersion },
        data: {
          syncStatus: "FAILED",
          lastTechnicalError: technical,
          lastUserFriendlyError:
            "Не удалось завершить настройку подписки. Мы повторим попытку автоматически.",
        },
      })
      await db.integrationLog.create({
        data: {
          integration: "remnawave",
          operation: "UPSERT_SUBSCRIBER",
          entityType: "Subscription",
          entityId: subscription.id,
          success: false,
          attempt: job.attempts,
          technicalError: technical,
          correlationId: correlationId(),
        },
      })
      if (job.attempts >= (job.maxAttempts ?? 8)) {
        const dedupeKey = `telegram:subscription:${subscription.id}:provisioning-failed:${syncVersion}`
        await db.outboxJob.upsert({
          where: { dedupeKey },
          create: {
            type: "SEND_TELEGRAM_NOTIFICATION",
            aggregateType: "Subscription",
            aggregateId: subscription.id,
            payloadJson: JSON.stringify({
              userId: subscription.userId,
              template: "PROVISIONING_FAILED",
            }),
            dedupeKey,
            maxAttempts: 5,
          },
          update: {},
        })
      }
      throw error
    }
    return
  }
  if (job.type === "PROCESS_TELEGRAM_UPDATE") {
    const updateId = String(payload.updateId)
    const log = await db.telegramUpdateLog.findUnique({ where: { updateId } })
    if (!log || log.processedAt) return
    const update = JSON.parse(log.payloadJson) as {
      message?: {
        command?: "start" | "account" | "notifications" | "help" | "other"
        startTokenHash?: string
        chat?: { id?: string; type?: string }
        from?: { id?: string; username?: string }
      }
    }
    const message = update.message
    if (!message?.from?.id || !message.chat?.id) {
      await db.telegramUpdateLog.update({
        where: { id: log.id },
        data: { processedAt: new Date() },
      })
      return
    }
    const chatId = message.chat.id
    if (message.chat.type !== "private" || chatId !== message.from.id) {
      await db.telegramUpdateLog.update({
        where: { id: log.id },
        data: { processedAt: new Date() },
      })
      return
    }
    if (message.command === "start" && message.startTokenHash) {
      await completeTelegramStart({
        startTokenHash: message.startTokenHash,
        telegramId: message.from.id,
        username: message.from.username,
        chatId,
      })
    } else if (message.command === "account")
      await getTelegramGateway().sendMessage({
        chatId,
        text: `Личный кабинет: ${getConfig().appUrl}/home`,
      })
    else if (message.command === "notifications")
      await getTelegramGateway().sendMessage({
        chatId,
        text: "Настройки уведомлений доступны в профиле Pulsar.",
      })
    else
      await getTelegramGateway().sendMessage({
        chatId,
        text: "Pulsar помогает войти в кабинет и присылает уведомления. Команды: /account, /notifications, /help",
      })
    await db.telegramUpdateLog.update({
      where: { id: log.id },
      data: { processedAt: new Date() },
    })
    return
  }
  if (job.type === "SEND_TELEGRAM_LOGIN_COMPLETION") {
    const chatId = String(payload.chatId)
    const token = decryptSensitive(String(payload.tokenEncrypted))
    await getTelegramGateway().sendMessage({
      chatId,
      text: "Вход подтверждён. Вернитесь в Pulsar.",
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: "Вернуться в Pulsar",
              url: `${getConfig().appUrl}/api/auth/telegram/complete?token=${encodeURIComponent(token)}&challenge=${encodeURIComponent(job.aggregateId)}`,
            },
          ],
        ],
      },
    })
    return
  }
  if (job.type === "SEND_TELEGRAM_LINK_CONFIRMED") {
    await getTelegramGateway().sendMessage({
      chatId: String(payload.chatId),
      text: "Telegram успешно привязан к аккаунту Pulsar.",
    })
    return
  }
  if (job.type === "REGENERATE_SUBSCRIPTION_URL") {
    const subscriptionId = String(payload.subscriptionId)
    const syncVersion = Number(payload.syncVersion)
    const subscription = await db.subscription.findUnique({
      where: { id: subscriptionId },
    })
    if (
      !subscription?.remnawaveUserId ||
      subscription.syncVersion !== syncVersion
    )
      return
    const result = await getProvisioningProvider().regenerateSubscriptionUrl({
      remoteUserId: subscription.remnawaveUserId,
    })
    await db.subscription.updateMany({
      where: { id: subscriptionId, syncVersion },
      data: {
        subscriptionUrl: result.subscriptionUrl,
        syncStatus: "SYNCED",
        lastSyncedAt: new Date(),
      },
    })
    return
  }
  if (job.type === "SEND_TELEGRAM_NOTIFICATION") {
    const profile = await db.telegramProfile.findUnique({
      where: { userId: String(payload.userId) },
    })
    if (
      !profile?.chatId ||
      !profile.canReceiveMessages ||
      !profile.transactionalNotificationsEnabled
    )
      return
    const messages: Record<string, string> = {
      PAYMENT_CONFIRMED:
        "Платёж подтверждён. Pulsar настраивает подписку; отдельное сообщение придёт, когда ссылка будет готова.",
      PROVISIONING_COMPLETED:
        "Настройка подписки Pulsar завершена. Ссылка для подключения доступна в личном кабинете.",
      PROVISIONING_FAILED:
        "Не удалось автоматически завершить настройку Pulsar. Мы сохранили оплату; обратитесь в поддержку через личный кабинет.",
      SUBSCRIPTION_EXPIRING_3D:
        "Подписка Pulsar закончится примерно через 3 дня. Продлить её можно в личном кабинете.",
      SUBSCRIPTION_EXPIRING_1D:
        "Подписка Pulsar закончится менее чем через сутки. Продлить её можно в личном кабинете.",
      SUBSCRIPTION_EXPIRED:
        "Срок подписки Pulsar закончился. Возобновить доступ можно в личном кабинете.",
      PAYOUT_APPROVED: "Заявка на выплату одобрена.",
      PAYOUT_PAID: "Выплата выполнена.",
    }
    try {
      await getTelegramGateway().sendMessage({
        chatId: profile.chatId,
        text:
          messages[String(payload.template)] ?? "Важное уведомление Pulsar.",
      })
    } catch (error) {
      if (error instanceof Error && /blocked|forbidden/i.test(error.message))
        await db.telegramProfile.update({
          where: { id: profile.id },
          data: { canReceiveMessages: false, botBlockedAt: new Date() },
        })
      throw error
    }
    return
  }
  if (job.type === "SEND_TELEGRAM_BROADCAST_BATCH") {
    const broadcastId = String(payload.broadcastId)
    const batch = Number(payload.batch ?? 0)
    const broadcast = await db.telegramBroadcast.findUnique({
      where: { id: broadcastId },
    })
    if (!broadcast || ["CANCELED", "COMPLETED"].includes(broadcast.status))
      return
    await db.telegramBroadcast.update({
      where: { id: broadcast.id },
      data: { status: "SENDING" },
    })
    const deliveries = await db.telegramBroadcastDelivery.findMany({
      where: { broadcastId, status: "PENDING" },
      include: { user: { include: { telegramProfile: true } } },
      take: 20,
    })
    for (const delivery of deliveries) {
      const profile = delivery.user.telegramProfile
      if (!profile?.chatId || !profile.canReceiveMessages)
        await db.telegramBroadcastDelivery.update({
          where: { id: delivery.id },
          data: { status: "SKIPPED" },
        })
      else
        try {
          const sent = await getTelegramGateway().sendMessage({
            chatId: profile.chatId,
            text: `${broadcast.title}\n\n${broadcast.body}`,
          })
          await db.telegramBroadcastDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "SENT",
              sentAt: new Date(),
              telegramMessageId: sent.messageId,
            },
          })
        } catch (error) {
          if (
            error instanceof Error &&
            /blocked|forbidden/i.test(error.message)
          )
            await db.telegramProfile.update({
              where: { id: profile.id },
              data: { canReceiveMessages: false, botBlockedAt: new Date() },
            })
          await db.telegramBroadcastDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "FAILED",
              error:
                error instanceof Error
                  ? error.message.slice(0, 500)
                  : String(error),
            },
          })
        }
    }
    const remaining = await db.telegramBroadcastDelivery.count({
      where: { broadcastId, status: "PENDING" },
    })
    if (remaining)
      await db.outboxJob.create({
        data: {
          type: "SEND_TELEGRAM_BROADCAST_BATCH",
          aggregateType: "TelegramBroadcast",
          aggregateId: broadcastId,
          payloadJson: JSON.stringify({ broadcastId, batch: batch + 1 }),
          dedupeKey: `broadcast:${broadcastId}:batch:${batch + 1}`,
        },
      })
    else
      await db.telegramBroadcast.update({
        where: { id: broadcastId },
        data: { status: "COMPLETED", completedAt: new Date() },
      })
    return
  }
  if (
    [
      "CLEANUP_AUTH_CHALLENGES",
      "CLEANUP_SESSIONS",
      "CLEANUP_WEBHOOK_LOGS",
    ].includes(job.type)
  ) {
    const now = new Date()
    const authCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60_000)
    const telegramCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60_000)
    const outboxCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60_000)
    const integrationCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60_000)
    const webhookCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60_000)
    await db.loginChallenge.updateMany({
      where: { status: "PENDING", expiresAt: { lt: now } },
      data: { status: "EXPIRED" },
    })
    await db.session.deleteMany({
      where: {
        OR: [
          { absoluteExpiresAt: { lt: now } },
          { idleExpiresAt: { lt: now } },
          { revokedAt: { not: null } },
        ],
      },
    })
    await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } })
    await db.loginChallenge.deleteMany({
      where: { createdAt: { lt: authCutoff }, status: { not: "PENDING" } },
    })
    await db.telegramUpdateLog.deleteMany({
      where: { receivedAt: { lt: telegramCutoff } },
    })
    await db.paymentWebhookLog.deleteMany({
      where: { receivedAt: { lt: webhookCutoff } },
    })
    await db.integrationLog.deleteMany({
      where: { createdAt: { lt: integrationCutoff } },
    })
    await db.outboxJob.deleteMany({
      where: { status: "COMPLETED", completedAt: { lt: outboxCutoff } },
    })
    await db.systemState.deleteMany({
      where: {
        key: { startsWith: "admin-broadcast-request:" },
        updatedAt: { lt: outboxCutoff },
      },
    })
    return
  }
  throw new Error(`Unsupported job type: ${job.type}`)
}
