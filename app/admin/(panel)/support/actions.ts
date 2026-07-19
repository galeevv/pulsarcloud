"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

const replySchema = z.object({
  conversationId: z.string().min(8).max(100),
  body: z.string().trim().min(2).max(1000),
  idempotencyKey: z.uuid(),
})

const internalNoteSchema = z.object({
  conversationId: z.string().min(8).max(100),
  body: z.string().trim().min(2).max(2000),
  idempotencyKey: z.uuid(),
})

const statusSchema = z.object({
  conversationId: z.string().min(8).max(100),
  status: z.enum(["OPEN", "CLOSED"]),
  idempotencyKey: z.uuid(),
})

export type SupportActionState = {
  status: "idle" | "success" | "error"
  message: string
  fieldErrors?: { body?: string }
}

export async function replyToSupport(
  _previous: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = replySchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
    idempotencyKey: formData.get("idempotencyKey"),
  })
  if (!parsed.success)
    return {
      status: "error",
      message: "Проверьте текст ответа.",
      fieldErrors: {
        body: parsed.error.flatten().fieldErrors.body?.[0],
      },
    }

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.supportMessage.findUnique({
        where: { id: parsed.data.idempotencyKey },
        select: { id: true, conversationId: true },
      })
      if (existing) {
        if (existing.conversationId !== parsed.data.conversationId)
          throw new Error("Idempotency key conflict")
        return
      }
      const conversation = await tx.supportConversation.findFirst({
        where: {
          id: parsed.data.conversationId,
          user: { is: { role: "USER", isTest: getConfig().testMode } },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          channel: true,
          user: {
            select: {
              identities: {
                where: { emailNormalized: { not: null } },
                select: { emailNormalized: true },
                take: 1,
              },
              telegramProfile: {
                select: { chatId: true, canReceiveMessages: true },
              },
            },
          },
        },
      })
      if (!conversation) throw new Error("Conversation not found")
      if (conversation.status === "CLOSED")
        throw new Error("Conversation is closed")
      if (
        conversation.channel === "TELEGRAM" &&
        (!conversation.user.telegramProfile?.chatId ||
          !conversation.user.telegramProfile.canReceiveMessages)
      )
        throw new Error("Telegram channel is unavailable")
      if (
        conversation.channel === "EMAIL" &&
        !conversation.user.identities[0]?.emailNormalized
      )
        throw new Error("Email channel is unavailable")
      const now = new Date()
      await tx.supportMessage.create({
        data: {
          id: parsed.data.idempotencyKey,
          conversationId: conversation.id,
          authorRole: "ADMIN",
          senderUserId: session.userId,
          source: "ADMIN",
          body: parsed.data.body,
        },
      })
      await tx.supportConversation.update({
        where: { id: conversation.id },
        data: {
          status: "OPEN",
          workflowState: "ANSWERED",
          lastMessageAt: now,
        },
      })
      if (conversation.channel !== "WEB")
        await tx.outboxJob.create({
          data: {
            type: "SEND_SUPPORT_REPLY",
            aggregateType: "SupportMessage",
            aggregateId: parsed.data.idempotencyKey,
            payloadJson: JSON.stringify({
              messageId: parsed.data.idempotencyKey,
              channel: conversation.channel,
            }),
            dedupeKey: `support-reply:${parsed.data.idempotencyKey}`,
          },
        })
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: session.userId,
          action: "SUPPORT_REPLIED",
          entityType: "SupportConversation",
          entityId: conversation.id,
          metadataJson: JSON.stringify({
            deliveryChannel: conversation.channel,
            userId: conversation.userId,
          }),
          correlationId: randomUUID(),
        },
      })
    })
  } catch {
    return {
      status: "error",
      message: "Не удалось сохранить ответ. Попробуйте ещё раз.",
    }
  }
  revalidatePath(`/admin/support/${parsed.data.conversationId}`)
  revalidatePath("/admin/support")
  revalidatePath("/admin/dashboard")
  return {
    status: "success",
    message: "Ответ сохранён. Внешняя доставка выполняется через очередь.",
  }
}

export async function changeSupportStatus(
  _previous: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = statusSchema.safeParse({
    conversationId: formData.get("conversationId"),
    status: formData.get("status"),
    idempotencyKey: formData.get("idempotencyKey"),
  })
  if (!parsed.success)
    return { status: "error", message: "Некорректный статус обращения." }

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.auditLog.findUnique({
        where: { id: parsed.data.idempotencyKey },
      })
      if (existing) return
      const conversation = await tx.supportConversation.findFirst({
        where: {
          id: parsed.data.conversationId,
          user: { is: { role: "USER", isTest: getConfig().testMode } },
        },
        select: {
          status: true,
          messages: {
            where: { isInternal: false },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { authorRole: true },
            take: 1,
          },
          _count: {
            select: {
              messages: {
                where: { authorRole: "ADMIN", isInternal: false },
              },
            },
          },
        },
      })
      if (!conversation) throw new Error("Conversation not found")
      const latestAuthor = conversation.messages[0]?.authorRole
      const reopenedState =
        latestAuthor === "ADMIN"
          ? ("ANSWERED" as const)
          : conversation._count.messages > 0
            ? ("WAITING" as const)
            : ("NEW" as const)
      await tx.supportConversation.update({
        where: { id: parsed.data.conversationId },
        data: {
          status: parsed.data.status,
          workflowState:
            parsed.data.status === "CLOSED" ? "CLOSED" : reopenedState,
        },
      })
      await tx.auditLog.create({
        data: {
          id: parsed.data.idempotencyKey,
          actorType: "ADMIN",
          actorId: session.userId,
          action:
            parsed.data.status === "CLOSED"
              ? "SUPPORT_CLOSED"
              : "SUPPORT_REOPENED",
          entityType: "SupportConversation",
          entityId: parsed.data.conversationId,
          metadataJson: JSON.stringify({
            from: conversation.status,
            to: parsed.data.status,
          }),
          correlationId: randomUUID(),
        },
      })
    })
  } catch {
    return {
      status: "error",
      message: "Не удалось изменить статус обращения.",
    }
  }
  revalidatePath(`/admin/support/${parsed.data.conversationId}`)
  revalidatePath("/admin/support")
  revalidatePath("/admin/dashboard")
  return {
    status: "success",
    message:
      parsed.data.status === "CLOSED"
        ? "Диалог закрыт."
        : "Диалог снова открыт.",
  }
}

export async function addSupportInternalNote(
  _previous: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = internalNoteSchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
    idempotencyKey: formData.get("idempotencyKey"),
  })
  if (!parsed.success)
    return {
      status: "error",
      message: "Проверьте текст внутренней заметки.",
      fieldErrors: {
        body: parsed.error.flatten().fieldErrors.body?.[0],
      },
    }

  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.supportMessage.findUnique({
        where: { id: parsed.data.idempotencyKey },
        select: { id: true, conversationId: true, isInternal: true },
      })
      if (existing) {
        if (
          existing.conversationId !== parsed.data.conversationId ||
          !existing.isInternal
        )
          throw new Error("Idempotency key conflict")
        return
      }
      const conversation = await tx.supportConversation.findFirst({
        where: {
          id: parsed.data.conversationId,
          user: { is: { role: "USER", isTest: getConfig().testMode } },
        },
        select: { id: true, userId: true },
      })
      if (!conversation) throw new Error("Conversation not found")
      await tx.supportMessage.create({
        data: {
          id: parsed.data.idempotencyKey,
          conversationId: conversation.id,
          authorRole: "ADMIN",
          senderUserId: session.userId,
          source: "ADMIN",
          body: parsed.data.body,
          isInternal: true,
        },
      })
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: session.userId,
          action: "SUPPORT_INTERNAL_NOTE_ADDED",
          entityType: "SupportConversation",
          entityId: conversation.id,
          metadataJson: JSON.stringify({ userId: conversation.userId }),
          correlationId: randomUUID(),
        },
      })
    })
  } catch {
    return {
      status: "error",
      message: "Не удалось сохранить внутреннюю заметку.",
    }
  }

  revalidatePath(`/admin/support/${parsed.data.conversationId}`)
  return {
    status: "success",
    message: "Внутренняя заметка сохранена.",
  }
}
