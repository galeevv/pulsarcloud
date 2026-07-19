"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { BusinessError, toFriendlyError } from "@/src/server/application/errors"
import { getConfig } from "@/src/server/config"
import { adjustWalletBalanceByAdmin } from "@/src/server/domain/wallet/service"
import { db } from "@/src/server/infrastructure/db/client"
import { correlationId } from "@/src/server/infrastructure/security/crypto"
import { requireWebSession } from "@/src/server/transport/web/session"

const walletAdjustmentSchema = z.object({
  userId: z.string().min(8).max(100),
  deltaRub: z.coerce
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0),
  comment: z.string().trim().min(5).max(500),
  idempotencyKey: z.uuid(),
})

const subscriptionManagementSchema = z.object({
  userId: z.string().min(8).max(100),
  daysToAdd: z.coerce.number().int().min(0).max(3650),
  deviceLimit: z.coerce.number().int().min(1).max(5),
  lteEnabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  comment: z.string().trim().min(5).max(500),
  idempotencyKey: z.uuid(),
})

export type WalletAdjustmentActionState = {
  status: "idle" | "success" | "error"
  message: string
  availableMinor?: number
  fieldErrors?: {
    deltaRub?: string
    comment?: string
  }
}

export type SubscriptionManagementActionState = {
  status: "idle" | "success" | "error"
  message: string
  expiresAt?: string
  fieldErrors?: {
    daysToAdd?: string
    deviceLimit?: string
    comment?: string
  }
}

export async function manageUserSubscription(
  _previousState: SubscriptionManagementActionState,
  formData: FormData
): Promise<SubscriptionManagementActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = subscriptionManagementSchema.safeParse({
    userId: formData.get("userId"),
    daysToAdd: formData.get("daysToAdd"),
    deviceLimit: formData.get("deviceLimit"),
    lteEnabled: formData.get("lteEnabled"),
    comment: formData.get("comment"),
    idempotencyKey: formData.get("idempotencyKey"),
  })

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return {
      status: "error",
      message: "Проверьте параметры подписки и обязательный комментарий.",
      fieldErrors: {
        daysToAdd: errors.daysToAdd?.length
          ? "Укажите целое число дней от 0 до 3650."
          : undefined,
        deviceLimit: errors.deviceLimit?.length
          ? "Лимит должен быть от 1 до 5 устройств."
          : undefined,
        comment: errors.comment?.length
          ? "Комментарий должен содержать от 5 до 500 символов."
          : undefined,
      },
    }
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const eventKey = `admin-manage:${session.userId}:${parsed.data.idempotencyKey}`
      const existingEvent = await tx.subscriptionEvent.findUnique({
        where: { idempotencyKey: eventKey },
        include: { subscription: true },
      })
      if (existingEvent)
        return { applied: false, subscription: existingEvent.subscription }

      const user = await tx.user.findUnique({
        where: { id: parsed.data.userId },
        select: { id: true, role: true, isTest: true },
      })
      if (!user || user.role !== "USER")
        throw new BusinessError("NOT_FOUND", 404)
      if (user.isTest !== getConfig().testMode)
        throw new BusinessError("ADMIN_FORBIDDEN", 403)

      const current = await tx.subscription.findUnique({
        where: { userId: user.id },
      })
      const now = new Date()
      const currentTermIsLive =
        current !== null &&
        current.expiresAt > now &&
        (current.status === "ACTIVE" || current.status === "TRIAL")
      if ((!current || !currentTermIsLive) && parsed.data.daysToAdd === 0)
        throw new BusinessError("INVALID_INPUT")

      const parametersChanged =
        !current ||
        current.deviceLimit !== parsed.data.deviceLimit ||
        current.lteEnabled !== parsed.data.lteEnabled
      if (!parametersChanged && parsed.data.daysToAdd === 0)
        throw new BusinessError("CONFLICT")

      const expiresAt =
        parsed.data.daysToAdd > 0
          ? new Date(
              Math.max(now.getTime(), current?.expiresAt.getTime() ?? 0) +
                parsed.data.daysToAdd * 86_400_000
            )
          : current!.expiresAt
      const syncVersion = (current?.syncVersion ?? 0) + 1
      const subscription = current
        ? await tx.subscription.update({
            where: { id: current.id },
            data: {
              status: parsed.data.daysToAdd > 0 ? "ACTIVE" : current.status,
              expiresAt,
              deviceLimit: parsed.data.deviceLimit,
              lteEnabled: parsed.data.lteEnabled,
              nextDeviceLimit: null,
              nextLteEnabled: null,
              nextParametersAt: null,
              syncStatus: "PENDING",
              syncVersion,
            },
          })
        : await tx.subscription.create({
            data: {
              userId: user.id,
              status: "ACTIVE",
              startedAt: now,
              expiresAt,
              deviceLimit: parsed.data.deviceLimit,
              lteEnabled: parsed.data.lteEnabled,
              syncStatus: "PENDING",
              syncVersion,
            },
          })

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type:
            parsed.data.daysToAdd > 0
              ? "ADMIN_EXTENDED"
              : "ADMIN_PARAMETERS_UPDATED",
          actorUserId: session.userId,
          previousStateJson: current ? JSON.stringify(current) : null,
          newStateJson: JSON.stringify(subscription),
          idempotencyKey: eventKey,
        },
      })
      await tx.outboxJob.create({
        data: {
          type: "PROVISION_SUBSCRIPTION",
          aggregateType: "Subscription",
          aggregateId: subscription.id,
          payloadJson: JSON.stringify({
            subscriptionId: subscription.id,
            syncVersion,
          }),
          dedupeKey: `subscription:${subscription.id}:sync:${syncVersion}`,
        },
      })
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: session.userId,
          action: "SUBSCRIPTION_MANAGED",
          entityType: "Subscription",
          entityId: subscription.id,
          metadataJson: JSON.stringify({
            daysToAdd: parsed.data.daysToAdd,
            deviceLimit: parsed.data.deviceLimit,
            lteEnabled: parsed.data.lteEnabled,
            comment: parsed.data.comment,
          }),
          correlationId: correlationId(),
        },
      })
      return { applied: true, subscription }
    })

    revalidatePath("/admin", "layout")
    revalidatePath(`/admin/users/${parsed.data.userId}`)
    return {
      status: "success",
      message: result.applied
        ? "Подписка пользователя обновлена."
        : "Эти изменения уже были применены.",
      expiresAt: result.subscription.expiresAt.toISOString(),
    }
  } catch (error) {
    if (error instanceof BusinessError && error.code === "INVALID_INPUT")
      return {
        status: "error",
        message:
          "Для новой, истёкшей или приостановленной подписки добавьте хотя бы один день.",
      }
    if (error instanceof BusinessError && error.code === "CONFLICT")
      return {
        status: "error",
        message: "Параметры не изменились. Выберите новые значения.",
      }
    return { status: "error", message: toFriendlyError(error).message }
  }
}

export async function adjustWallet(
  _previousState: WalletAdjustmentActionState,
  formData: FormData
): Promise<WalletAdjustmentActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = walletAdjustmentSchema.safeParse({
    userId: formData.get("userId"),
    deltaRub: formData.get("deltaRub"),
    comment: formData.get("comment"),
    idempotencyKey: formData.get("idempotencyKey"),
  })
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return {
      status: "error",
      message: "Проверьте сумму и обязательный комментарий.",
      fieldErrors: {
        deltaRub: errors.deltaRub?.length
          ? "Укажите целую ненулевую сумму от −1 000 000 до 1 000 000 ₽."
          : undefined,
        comment: errors.comment?.length
          ? "Комментарий должен содержать от 5 до 500 символов."
          : undefined,
      },
    }
  }

  try {
    const result = await adjustWalletBalanceByAdmin({
      adminUserId: session.userId,
      userId: parsed.data.userId,
      deltaMinor: parsed.data.deltaRub * 100,
      comment: parsed.data.comment,
      idempotencyKey: parsed.data.idempotencyKey,
      correlationId: correlationId(),
    })
    revalidatePath("/admin", "layout")
    revalidatePath(`/admin/users/${parsed.data.userId}`)
    return {
      status: "success",
      message: result.applied
        ? "Баланс пользователя обновлён."
        : "Эта корректировка уже была применена.",
      availableMinor: result.availableMinor,
    }
  } catch (error) {
    return { status: "error", message: toFriendlyError(error).message }
  }
}
