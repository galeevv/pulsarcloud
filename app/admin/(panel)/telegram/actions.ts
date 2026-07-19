"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { Prisma } from "@/src/generated/prisma/client"
import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { correlationId } from "@/src/server/infrastructure/security/crypto"
import { requireWebSession } from "@/src/server/transport/web/session"

const draftSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(3500),
  idempotencyKey: z.uuid(),
})

const broadcastMutationSchema = z.object({
  broadcastId: z.string().min(8).max(100),
  idempotencyKey: z.uuid(),
})

export type TelegramActionState = {
  status: "idle" | "success" | "error"
  message: string
  broadcastId?: string
  fieldErrors?: {
    title?: string
    body?: string
  }
}

async function claimRequest(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string
    idempotencyKey: string
    action: string
    broadcastId?: string
  }
) {
  const key = `admin-broadcast-request:${input.actorId}:${input.idempotencyKey}`
  const previous = await tx.systemState.findUnique({ where: { key } })
  if (previous) return false
  await tx.systemState.create({
    data: {
      key,
      valueJson: JSON.stringify({
        action: input.action,
        broadcastId: input.broadcastId,
        createdAt: new Date(),
      }),
    },
  })
  return true
}

export async function createTelegramBroadcastDraft(
  _previousState: TelegramActionState,
  formData: FormData
): Promise<TelegramActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = draftSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return {
      status: "error",
      message: "Проверьте текст рассылки.",
      fieldErrors: {
        title: errors.title?.[0],
        body: errors.body?.[0],
      },
    }
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const claimed = await claimRequest(tx, {
        actorId: session.userId,
        idempotencyKey: parsed.data.idempotencyKey,
        action: "BROADCAST_DRAFT_CREATED",
      })
      if (!claimed) return null

      const broadcast = await tx.telegramBroadcast.create({
        data: {
          createdByAdminId: session.userId,
          title: parsed.data.title,
          body: parsed.data.body,
          // Admin broadcasts are news. Transactional notifications use their
          // own outbox job types and must never be modeled as a broadcast.
          target: "NEWS_OPTED_IN",
          status: "DRAFT",
        },
      })
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: session.userId,
          action: "BROADCAST_DRAFT_CREATED",
          entityType: "TelegramBroadcast",
          entityId: broadcast.id,
          metadataJson: JSON.stringify({ target: broadcast.target }),
          correlationId: correlationId(),
        },
      })
      return broadcast
    })

    revalidatePath("/admin/telegram")
    return {
      status: "success",
      message: result ? "Черновик создан." : "Черновик уже был создан.",
      broadcastId: result?.id,
    }
  } catch {
    return {
      status: "error",
      message: "Не удалось создать черновик. Повторите попытку.",
    }
  }
}

export async function queueTelegramBroadcast(
  _previousState: TelegramActionState,
  formData: FormData
): Promise<TelegramActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = broadcastMutationSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { status: "error", message: "Некорректная рассылка." }

  const config = getConfig()
  try {
    const result = await db.$transaction(async (tx) => {
      const broadcast = await tx.telegramBroadcast.findFirst({
        where: {
          id: parsed.data.broadcastId,
          createdBy: {
            is: { role: "ADMIN", isTest: config.testMode },
          },
        },
      })
      if (!broadcast) throw new Error("NOT_FOUND")
      if (["QUEUED", "SENDING", "COMPLETED"].includes(broadcast.status))
        return { audience: null, alreadyQueued: true }
      if (broadcast.status !== "DRAFT") throw new Error("NOT_DRAFT")

      const claimed = await claimRequest(tx, {
        actorId: session.userId,
        idempotencyKey: parsed.data.idempotencyKey,
        action: "BROADCAST_QUEUED",
        broadcastId: broadcast.id,
      })
      if (!claimed) return { audience: null, alreadyQueued: true }

      const changed = await tx.telegramBroadcast.updateMany({
        where: { id: broadcast.id, status: "DRAFT" },
        data: { status: "QUEUED", queuedAt: new Date() },
      })
      if (!changed.count) return { audience: null, alreadyQueued: true }

      const profiles = await tx.telegramProfile.findMany({
        where: {
          canReceiveMessages: true,
          chatId: { not: null },
          user: {
            role: "USER",
            status: "ACTIVE",
            isTest: config.testMode,
          },
          // Respect the current preference even for a legacy ALL_REACHABLE
          // draft. That historical target can no longer expand a news
          // audience.
          newsNotificationsEnabled: true,
        },
        select: { userId: true },
      })
      if (profiles.length) {
        await tx.telegramBroadcastDelivery.createMany({
          data: profiles.map((profile) => ({
            broadcastId: broadcast.id,
            userId: profile.userId,
          })),
        })
      }
      await tx.outboxJob.upsert({
        where: { dedupeKey: `broadcast:${broadcast.id}:batch:0` },
        create: {
          type: "SEND_TELEGRAM_BROADCAST_BATCH",
          aggregateType: "TelegramBroadcast",
          aggregateId: broadcast.id,
          payloadJson: JSON.stringify({
            broadcastId: broadcast.id,
            batch: 0,
          }),
          dedupeKey: `broadcast:${broadcast.id}:batch:0`,
        },
        update: {},
      })
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: session.userId,
          action: "BROADCAST_QUEUED",
          entityType: "TelegramBroadcast",
          entityId: broadcast.id,
          metadataJson: JSON.stringify({
            audience: profiles.length,
            effectiveTarget: "NEWS_OPTED_IN",
            storedTarget: broadcast.target,
          }),
          correlationId: correlationId(),
        },
      })
      return { audience: profiles.length, alreadyQueued: false }
    })

    revalidatePath("/admin/telegram")
    return {
      status: "success",
      message: result.alreadyQueued
        ? "Рассылка уже поставлена в очередь."
        : `Рассылка поставлена в очередь для ${result.audience} получателей.`,
      broadcastId: parsed.data.broadcastId,
    }
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error && error.message === "NOT_DRAFT"
          ? "Отправить можно только черновик."
          : "Не удалось поставить рассылку в очередь.",
    }
  }
}

export async function cancelTelegramBroadcast(
  _previousState: TelegramActionState,
  formData: FormData
): Promise<TelegramActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = broadcastMutationSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { status: "error", message: "Некорректная рассылка." }

  const config = getConfig()
  try {
    const result = await db.$transaction(async (tx) => {
      const broadcast = await tx.telegramBroadcast.findFirst({
        where: {
          id: parsed.data.broadcastId,
          createdBy: {
            is: { role: "ADMIN", isTest: config.testMode },
          },
        },
      })
      if (!broadcast) throw new Error("NOT_FOUND")
      if (broadcast.status === "CANCELED") return { alreadyCanceled: true }
      if (!["DRAFT", "QUEUED"].includes(broadcast.status))
        throw new Error("ALREADY_STARTED")

      const claimed = await claimRequest(tx, {
        actorId: session.userId,
        idempotencyKey: parsed.data.idempotencyKey,
        action: "BROADCAST_CANCELED",
        broadcastId: broadcast.id,
      })
      if (!claimed) return { alreadyCanceled: true }

      const changed = await tx.telegramBroadcast.updateMany({
        where: {
          id: broadcast.id,
          status: { in: ["DRAFT", "QUEUED"] },
        },
        data: { status: "CANCELED" },
      })
      if (!changed.count) throw new Error("ALREADY_STARTED")

      await tx.telegramBroadcastDelivery.updateMany({
        where: { broadcastId: broadcast.id, status: "PENDING" },
        data: { status: "SKIPPED" },
      })
      await tx.outboxJob.updateMany({
        where: {
          type: "SEND_TELEGRAM_BROADCAST_BATCH",
          aggregateId: broadcast.id,
          status: { in: ["PENDING", "FAILED"] },
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lastError: "Canceled by administrator before sending",
        },
      })
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: session.userId,
          action: "BROADCAST_CANCELED",
          entityType: "TelegramBroadcast",
          entityId: broadcast.id,
          correlationId: correlationId(),
        },
      })
      return { alreadyCanceled: false }
    })

    revalidatePath("/admin/telegram")
    return {
      status: "success",
      message: result.alreadyCanceled
        ? "Рассылка уже отменена."
        : "Рассылка отменена до начала отправки.",
      broadcastId: parsed.data.broadcastId,
    }
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error && error.message === "ALREADY_STARTED"
          ? "Рассылка уже отправляется — отмена недоступна."
          : "Не удалось отменить рассылку.",
    }
  }
}
