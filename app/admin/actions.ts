"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { BusinessError, toFriendlyError } from "@/src/server/application/errors"
import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { correlationId } from "@/src/server/infrastructure/security/crypto"
import { requireWebSession } from "@/src/server/transport/web/session"

const subscriptionManagementSchema = z.object({
  userId: z.string().min(8).max(100),
  daysToAdd: z.coerce.number().int().min(0).max(3650),
  deviceLimit: z.coerce.number().int().min(1).max(5),
  lteEnabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  comment: z.string().trim().min(5).max(500),
  idempotencyKey: z.uuid(),
})

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

const partnerEnrollmentSchema = z.object({
  userId: z.string().min(8).max(100),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  rateBps: z.coerce.number().int().min(1).max(10_000),
})

export async function setPartnerEnrollment(formData: FormData) {
  const session = await requireWebSession("ADMIN")
  const parsed = partnerEnrollmentSchema.safeParse({
    userId: formData.get("userId"),
    enabled: formData.get("enabled"),
    rateBps: formData.get("rateBps"),
  })
  if (!parsed.success) throw new BusinessError("INVALID_INPUT")

  await db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: {
        id: parsed.data.userId,
        role: "USER",
        isTest: getConfig().testMode,
      },
      select: { id: true },
    })
    if (!user) throw new BusinessError("NOT_FOUND", 404)
    const now = new Date()
    await tx.partnerEnrollment.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        enabled: parsed.data.enabled,
        rateBps: parsed.data.rateBps,
        enabledAt: parsed.data.enabled ? now : null,
        disabledAt: parsed.data.enabled ? null : now,
      },
      update: {
        enabled: parsed.data.enabled,
        rateBps: parsed.data.rateBps,
        enabledAt: parsed.data.enabled ? now : undefined,
        disabledAt: parsed.data.enabled ? null : now,
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: parsed.data.enabled
          ? "PARTNER_PROGRAM_ENABLED"
          : "PARTNER_PROGRAM_DISABLED",
        entityType: "User",
        entityId: user.id,
        metadataJson: JSON.stringify({ rateBps: parsed.data.rateBps }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath(`/admin/users/${parsed.data.userId}`)
  revalidatePath("/referrals")
  revalidatePath("/partner")
}

const referralProgramSchema = z.object({
  userId: z.string().min(8).max(100),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
})

export async function setReferralProgram(formData: FormData) {
  const session = await requireWebSession("ADMIN")
  const parsed = referralProgramSchema.safeParse({
    userId: formData.get("userId"),
    enabled: formData.get("enabled"),
  })
  if (!parsed.success) throw new BusinessError("INVALID_INPUT")
  await db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: parsed.data.userId, role: "USER", isTest: getConfig().testMode },
      select: { id: true },
    })
    if (!user) throw new BusinessError("NOT_FOUND", 404)
    const now = new Date()
    await tx.referralProfile.update({
      where: { userId: user.id },
      data: { isEnabled: parsed.data.enabled, enabledAt: parsed.data.enabled ? now : null },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: parsed.data.enabled ? "REFERRAL_PROGRAM_ENABLED" : "REFERRAL_PROGRAM_DISABLED",
        entityType: "User",
        entityId: user.id,
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath(`/admin/users/${parsed.data.userId}`)
  revalidatePath("/referrals")
}

const partnerPayoutReviewSchema = z.object({
  payoutId: z.string().min(8).max(100),
  decision: z.enum(["PAID", "REJECTED"]),
  rejectionReason: z.string().trim().max(500).optional(),
})

export async function reviewPartnerPayout(formData: FormData) {
  const session = await requireWebSession("ADMIN")
  const parsed = partnerPayoutReviewSchema.safeParse({
    payoutId: formData.get("payoutId"),
    decision: formData.get("decision"),
    rejectionReason: formData.get("rejectionReason") || undefined,
  })
  if (!parsed.success) throw new BusinessError("INVALID_INPUT")

  await db.$transaction(async (tx) => {
    const payout = await tx.payoutRequest.findUnique({
      where: { id: parsed.data.payoutId },
    })
    if (!payout || payout.status !== "PENDING")
      throw new BusinessError("CONFLICT")
    const wallet = await tx.walletAccount.findUnique({
      where: { userId: payout.userId },
    })
    if (!wallet || wallet.reservedMinor < payout.amountMinor)
      throw new BusinessError("CONFLICT")
    const now = new Date()
    const walletAfter = await tx.walletAccount.update({
      where: { id: wallet.id },
      data:
        parsed.data.decision === "PAID"
          ? {
              reservedMinor: { decrement: payout.amountMinor },
              version: { increment: 1 },
            }
          : {
              availableMinor: { increment: payout.amountMinor },
              reservedMinor: { decrement: payout.amountMinor },
              version: { increment: 1 },
            },
    })
    await tx.payoutRequest.update({
      where: { id: payout.id },
      data: {
        status: parsed.data.decision,
        reviewedByAdminId: session.userId,
        reviewedAt: now,
        rejectionReason:
          parsed.data.decision === "REJECTED"
            ? (parsed.data.rejectionReason ?? null)
            : null,
      },
    })
    await tx.walletLedgerEntry.create({
      data: {
        walletAccountId: walletAfter.id,
        userId: payout.userId,
        type:
          parsed.data.decision === "PAID"
            ? "PARTNER_PAYOUT_PAID"
            : "PARTNER_PAYOUT_RELEASE",
        deltaAvailableMinor:
          parsed.data.decision === "PAID" ? 0 : payout.amountMinor,
        deltaReservedMinor: -payout.amountMinor,
        referenceType: "PayoutRequest",
        referenceId: payout.id,
        idempotencyKey: `partner-payout-review:${payout.id}:${parsed.data.decision}`,
        description:
          parsed.data.decision === "PAID"
            ? "Партнёрская выплата подтверждена администратором"
            : "Средства возвращены после отклонения заявки",
        createdAt: now,
      },
    })
    await tx.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action:
          parsed.data.decision === "PAID"
            ? "PARTNER_PAYOUT_PAID"
            : "PARTNER_PAYOUT_REJECTED",
        entityType: "PayoutRequest",
        entityId: payout.id,
        metadataJson: JSON.stringify({
          amountMinor: payout.amountMinor,
          rejectionReason: parsed.data.rejectionReason,
        }),
        correlationId: correlationId(),
      },
    })
  })
  revalidatePath("/admin/partner")
  revalidatePath("/partner")
}

const infrastructurePaymentSchema = z.object({
  title: z.string().trim().min(2).max(120),
  vendor: z.string().trim().min(2).max(120),
  amountRubles: z.coerce.number().min(0).max(1_000_000),
  dueAt: z.coerce.date(),
  note: z.string().trim().max(500).optional(),
  idempotencyKey: z.uuid(),
})

export type InfrastructurePaymentActionState = {
  status: "idle" | "success" | "error"
  message: string
  fieldErrors?: Record<string, string>
}

export async function createInfrastructurePayment(
  _previousState: InfrastructurePaymentActionState,
  formData: FormData
): Promise<InfrastructurePaymentActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = infrastructurePaymentSchema.safeParse({
    title: formData.get("title"),
    vendor: formData.get("vendor"),
    amountRubles: formData.get("amountRubles"),
    dueAt: formData.get("dueAt"),
    note: formData.get("note") || undefined,
    idempotencyKey: formData.get("idempotencyKey"),
  })
  if (!parsed.success) return { status: "error", message: "Проверьте поля платежа." }
  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.auditLog.findFirst({
        where: {
          actorId: session.userId,
          action: "INFRASTRUCTURE_PAYMENT_CREATED",
          correlationId: parsed.data.idempotencyKey,
        },
      })
      if (existing) return
      const payment = await tx.infrastructurePayment.create({
        data: {
          title: parsed.data.title,
          vendor: parsed.data.vendor,
          amountMinor: Math.round(parsed.data.amountRubles * 100),
          dueAt: parsed.data.dueAt,
          note: parsed.data.note || null,
        },
      })
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: session.userId,
          action: "INFRASTRUCTURE_PAYMENT_CREATED",
          entityType: "InfrastructurePayment",
          entityId: payment.id,
          correlationId: parsed.data.idempotencyKey,
        },
      })
    })
    revalidatePath("/admin/infrastructure")
    return { status: "success", message: "Платёж добавлен." }
  } catch (error) {
    return { status: "error", message: toFriendlyError(error).message }
  }
}

export async function markInfrastructurePaymentPaid(formData: FormData) {
  const session = await requireWebSession("ADMIN")
  const id = String(formData.get("paymentId") ?? "")
  if (!id) return
  const result = await db.infrastructurePayment.updateMany({
    where: { id, status: "PLANNED" },
    data: { status: "PAID", paidAt: new Date() },
  })
  if (result.count) {
    await db.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: session.userId,
        action: "INFRASTRUCTURE_PAYMENT_PAID",
        entityType: "InfrastructurePayment",
        entityId: id,
        correlationId: correlationId(),
      },
    })
  }
  revalidatePath("/admin/infrastructure")
}
