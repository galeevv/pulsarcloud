import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

type DeliveryCounts = {
  pending: number
  sent: number
  failed: number
  skipped: number
}

function emptyDeliveryCounts(): DeliveryCounts {
  return { pending: 0, sent: 0, failed: 0, skipped: 0 }
}

export async function getAdminTelegramView() {
  await requireWebSession("ADMIN")

  const config = getConfig()
  const profileWhere = {
    user: {
      role: "USER" as const,
      isTest: config.testMode,
    },
  }
  const [
    linked,
    reachable,
    newsOptedIn,
    blocked,
    failedDeliveries,
    pendingUpdates,
    latestUpdate,
    broadcasts,
  ] = await Promise.all([
    db.telegramProfile.count({ where: profileWhere }),
    db.telegramProfile.count({
      where: {
        ...profileWhere,
        canReceiveMessages: true,
        chatId: { not: null },
      },
    }),
    db.telegramProfile.count({
      where: {
        ...profileWhere,
        canReceiveMessages: true,
        newsNotificationsEnabled: true,
        chatId: { not: null },
      },
    }),
    db.telegramProfile.count({
      where: {
        ...profileWhere,
        botBlockedAt: { not: null },
      },
    }),
    db.telegramBroadcastDelivery.count({
      where: {
        status: "FAILED",
        user: { role: "USER", isTest: config.testMode },
      },
    }),
    db.telegramUpdateLog.count({
      where: {
        processedAt: null,
        processingError: { not: null },
      },
    }),
    db.telegramUpdateLog.findFirst({
      orderBy: { receivedAt: "desc" },
      select: {
        receivedAt: true,
        processedAt: true,
        processingError: true,
      },
    }),
    db.telegramBroadcast.findMany({
      where: {
        createdBy: {
          is: { role: "ADMIN", isTest: config.testMode },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        body: true,
        target: true,
        status: true,
        queuedAt: true,
        completedAt: true,
        createdAt: true,
      },
    }),
  ])

  const deliveryGroups = broadcasts.length
    ? await db.telegramBroadcastDelivery.groupBy({
        by: ["broadcastId", "status"],
        where: { broadcastId: { in: broadcasts.map((item) => item.id) } },
        _count: { _all: true },
      })
    : []
  const deliveriesByBroadcast = new Map<string, DeliveryCounts>()
  for (const group of deliveryGroups) {
    const counts =
      deliveriesByBroadcast.get(group.broadcastId) ?? emptyDeliveryCounts()
    if (group.status === "PENDING") counts.pending = group._count._all
    else if (group.status === "SENT") counts.sent = group._count._all
    else if (group.status === "FAILED") counts.failed = group._count._all
    else if (group.status === "SKIPPED") counts.skipped = group._count._all
    deliveriesByBroadcast.set(group.broadcastId, counts)
  }

  return {
    generatedAt: new Date(),
    audience: {
      linked,
      reachable,
      newsOptedIn,
      blocked,
      failedDeliveries,
    },
    bot: {
      configured: Boolean(config.telegram.botToken),
      username: config.telegram.botUsername ?? null,
      webhookConfigured: Boolean(config.telegram.webhookSecret),
      pendingUpdateErrors: pendingUpdates,
      latestUpdate,
    },
    broadcasts: broadcasts.map((broadcast) => ({
      id: broadcast.id,
      title: broadcast.title,
      body: broadcast.body,
      target: broadcast.target,
      status: broadcast.status,
      queuedAt: broadcast.queuedAt,
      completedAt: broadcast.completedAt,
      createdAt: broadcast.createdAt,
      deliveries:
        deliveriesByBroadcast.get(broadcast.id) ?? emptyDeliveryCounts(),
    })),
  }
}

export type AdminTelegramView = Awaited<ReturnType<typeof getAdminTelegramView>>
