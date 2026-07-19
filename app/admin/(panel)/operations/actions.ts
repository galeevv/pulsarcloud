"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { Prisma } from "@/src/generated/prisma/client"
import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

const actionSchema = z.object({
  jobId: z.string().min(8).max(100),
  idempotencyKey: z.uuid(),
})

const cancellableTypes = new Set([
  "SEND_TELEGRAM_NOTIFICATION",
  "SEND_TELEGRAM_BROADCAST_BATCH",
])

const globalSafeJobTypes = new Set([
  "CLEANUP_AUTH_CHALLENGES",
  "CLEANUP_SESSIONS",
  "CLEANUP_WEBHOOK_LOGS",
  "RECONCILE_PENDING_PAYMENTS",
  "RECONCILE_SUBSCRIPTIONS",
])

type JobIdentity = {
  type: string
  aggregateType: string
  aggregateId: string
}

export type OperationActionState = {
  status: "idle" | "success" | "error"
  message: string
}

async function jobBelongsToEnvironment(
  tx: Prisma.TransactionClient,
  job: JobIdentity,
  isTest: boolean
) {
  if (job.aggregateType === "System") return globalSafeJobTypes.has(job.type)

  if (job.aggregateType === "User")
    return Boolean(
      await tx.user.findFirst({
        where: { id: job.aggregateId, role: "USER", isTest },
        select: { id: true },
      })
    )

  if (job.aggregateType === "Payment")
    return Boolean(
      await tx.payment.findFirst({
        where: {
          id: job.aggregateId,
          isTest,
          user: { is: { role: "USER", isTest } },
        },
        select: { id: true },
      })
    )

  if (job.aggregateType === "Subscription")
    return Boolean(
      await tx.subscription.findFirst({
        where: {
          id: job.aggregateId,
          user: { is: { role: "USER", isTest } },
        },
        select: { id: true },
      })
    )

  if (job.aggregateType === "PayoutRequest")
    return Boolean(
      await tx.payoutRequest.findFirst({
        where: {
          id: job.aggregateId,
          user: { is: { role: "USER", isTest } },
        },
        select: { id: true },
      })
    )

  if (job.aggregateType === "SupportConversation")
    return Boolean(
      await tx.supportConversation.findFirst({
        where: {
          id: job.aggregateId,
          user: { is: { role: "USER", isTest } },
        },
        select: { id: true },
      })
    )

  if (job.aggregateType === "SupportMessage")
    return Boolean(
      await tx.supportMessage.findFirst({
        where: {
          id: job.aggregateId,
          conversation: {
            is: { user: { is: { role: "USER", isTest } } },
          },
        },
        select: { id: true },
      })
    )

  if (job.aggregateType === "TelegramBroadcast")
    return Boolean(
      await tx.telegramBroadcast.findFirst({
        where: {
          id: job.aggregateId,
          createdBy: { is: { role: "ADMIN", isTest } },
          deliveries: {
            none: {
              user: { is: { isTest: !isTest } },
            },
          },
        },
        select: { id: true },
      })
    )

  if (job.aggregateType === "LoginChallenge")
    return Boolean(
      await tx.loginChallenge.findFirst({
        where: {
          id: job.aggregateId,
          requestedByUser: { is: { isTest } },
        },
        select: { id: true },
      })
    )

  return false
}

export async function retryOutboxJob(
  _previous: OperationActionState,
  formData: FormData
): Promise<OperationActionState> {
  const session = await requireWebSession("ADMIN")
  const isTest = getConfig().testMode
  const parsed = actionSchema.safeParse({
    jobId: formData.get("jobId"),
    idempotencyKey: formData.get("idempotencyKey"),
  })
  if (!parsed.success)
    return { status: "error", message: "Некорректная задача." }

  try {
    await db.$transaction(async (tx) => {
      const existingAudit = await tx.auditLog.findUnique({
        where: { id: parsed.data.idempotencyKey },
      })
      if (existingAudit) {
        if (
          existingAudit.action === "JOB_RETRIED" &&
          existingAudit.entityType === "OutboxJob" &&
          existingAudit.entityId === parsed.data.jobId
        )
          return
        throw new Error("Idempotency key already used")
      }
      const job = await tx.outboxJob.findUnique({
        where: { id: parsed.data.jobId },
      })
      if (!job) throw new Error("Job not found")
      if (!["FAILED", "DEAD"].includes(job.status))
        throw new Error("Job cannot be retried")
      if (!(await jobBelongsToEnvironment(tx, job, isTest)))
        throw new Error("Job environment mismatch")
      const changed = await tx.outboxJob.updateMany({
        where: { id: job.id, status: { in: ["FAILED", "DEAD"] } },
        data: {
          status: "PENDING",
          attempts: 0,
          runAfter: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
          completedAt: null,
        },
      })
      if (changed.count !== 1) throw new Error("Job state changed")
      await tx.auditLog.create({
        data: {
          id: parsed.data.idempotencyKey,
          actorType: "ADMIN",
          actorId: session.userId,
          action: "JOB_RETRIED",
          entityType: "OutboxJob",
          entityId: job.id,
          metadataJson: JSON.stringify({
            previousStatus: job.status,
            previousAttempts: job.attempts,
            type: job.type,
          }),
          correlationId: randomUUID(),
        },
      })
    })
  } catch {
    return {
      status: "error",
      message:
        "Задача недоступна в текущем окружении или не может быть повторена.",
    }
  }
  revalidatePath("/admin/operations")
  revalidatePath("/admin/dashboard")
  return { status: "success", message: "Задача возвращена в очередь." }
}

export async function cancelOutboxJob(
  _previous: OperationActionState,
  formData: FormData
): Promise<OperationActionState> {
  const session = await requireWebSession("ADMIN")
  const isTest = getConfig().testMode
  const parsed = actionSchema.safeParse({
    jobId: formData.get("jobId"),
    idempotencyKey: formData.get("idempotencyKey"),
  })
  if (!parsed.success)
    return { status: "error", message: "Некорректная задача." }

  try {
    await db.$transaction(async (tx) => {
      const existingAudit = await tx.auditLog.findUnique({
        where: { id: parsed.data.idempotencyKey },
      })
      if (existingAudit) {
        if (
          existingAudit.action === "JOB_CANCELED" &&
          existingAudit.entityType === "OutboxJob" &&
          existingAudit.entityId === parsed.data.jobId
        )
          return
        throw new Error("Idempotency key already used")
      }
      const job = await tx.outboxJob.findUnique({
        where: { id: parsed.data.jobId },
      })
      if (!job) throw new Error("Job not found")
      if (job.status !== "PENDING" || !cancellableTypes.has(job.type))
        throw new Error("Job cannot be canceled")
      if (!(await jobBelongsToEnvironment(tx, job, isTest)))
        throw new Error("Job environment mismatch")
      const canceledAt = new Date()
      const canceled = await tx.outboxJob.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: {
          status: "COMPLETED",
          lockedAt: null,
          lockedBy: null,
          completedAt: canceledAt,
          lastError: "Canceled by administrator before execution",
        },
      })
      if (canceled.count !== 1) throw new Error("Job state changed")
      if (job.type === "SEND_TELEGRAM_BROADCAST_BATCH") {
        await tx.telegramBroadcast.updateMany({
          where: {
            id: job.aggregateId,
            status: { in: ["QUEUED", "SENDING"] },
          },
          data: { status: "CANCELED" },
        })
        await tx.telegramBroadcastDelivery.updateMany({
          where: { broadcastId: job.aggregateId, status: "PENDING" },
          data: { status: "SKIPPED" },
        })
      }
      await tx.auditLog.create({
        data: {
          id: parsed.data.idempotencyKey,
          actorType: "ADMIN",
          actorId: session.userId,
          action: "JOB_CANCELED",
          entityType: "OutboxJob",
          entityId: job.id,
          metadataJson: JSON.stringify({
            type: job.type,
            aggregateType: job.aggregateType,
            aggregateId: job.aggregateId,
            previousStatus: job.status,
            terminalStatus: "COMPLETED",
            canceledAt,
          }),
          correlationId: randomUUID(),
        },
      })
    })
  } catch {
    return {
      status: "error",
      message:
        "Задача недоступна в текущем окружении или не может быть отменена.",
    }
  }
  revalidatePath("/admin/operations")
  revalidatePath("/admin/telegram")
  revalidatePath("/admin/dashboard")
  return { status: "success", message: "Ожидающая задача отменена." }
}
