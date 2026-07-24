"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getConfig } from "@/src/server/config"
import { db, withBusyRetry } from "@/src/server/infrastructure/db/client"
import { correlationId } from "@/src/server/infrastructure/security/crypto"
import { requireWebSession } from "@/src/server/transport/web/session"

const booleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")

const createPromoSchema = z.object({
  name: z.string().trim().min(3).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  claimLimit: z.coerce.number().int().min(1).max(100_000),
  registrationWindowDays: z.coerce.number().int().min(1).max(365),
  durationDays: z.coerce.number().int().min(1).max(365),
  deviceLimit: z.coerce.number().int().min(1).max(5),
  lteEnabled: booleanSchema,
  idempotencyKey: z.uuid(),
})

const statusSchema = z.object({
  campaignId: z.string().trim().min(1).max(64),
  intent: z.enum(["activate", "pause"]),
})

export type PromoActionState = {
  status: "idle" | "success" | "error"
  message: string
  fieldErrors?: {
    name?: string
    slug?: string
    claimLimit?: string
    registrationWindowDays?: string
    durationDays?: string
    deviceLimit?: string
  }
}

class PromoCampaignExpiredError extends Error {
  readonly name = "PromoCampaignExpiredError"
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  )
}

export async function createPromoCampaign(
  _previousState: PromoActionState,
  formData: FormData
): Promise<PromoActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = createPromoSchema.safeParse({
    ...Object.fromEntries(formData),
    lteEnabled: String(formData.get("lteEnabled") ?? "false"),
  })
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return {
      status: "error",
      message: "Проверьте параметры кампании.",
      fieldErrors: {
        name: errors.name?.[0],
        slug: errors.slug?.[0],
        claimLimit: errors.claimLimit?.[0],
        registrationWindowDays: errors.registrationWindowDays?.[0],
        durationDays: errors.durationDays?.[0],
        deviceLimit: errors.deviceLimit?.[0],
      },
    }
  }

  const value = parsed.data
  const isTest = getConfig().testMode
  try {
    const created = await withBusyRetry(() =>
      db.$transaction(async (tx) => {
        const requestKey = `admin-promo-create:${session.userId}:${value.idempotencyKey}`
        const previousRequest = await tx.systemState.findUnique({
          where: { key: requestKey },
        })
        if (previousRequest) return false

        const campaign = await tx.promoCampaign.create({
          data: {
            name: value.name,
            slug: value.slug,
            claimLimit: value.claimLimit,
            registrationWindowDays: value.registrationWindowDays,
            durationDays: value.durationDays,
            deviceLimit: value.deviceLimit,
            lteEnabled: value.lteEnabled,
            isTest,
            createdByAdminId: session.userId,
          },
        })
        await tx.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: session.userId,
            action: "PROMO_CAMPAIGN_CREATED",
            entityType: "PromoCampaign",
            entityId: campaign.id,
            metadataJson: JSON.stringify({
              slug: campaign.slug,
              claimLimit: campaign.claimLimit,
              registrationWindowDays: campaign.registrationWindowDays,
              durationDays: campaign.durationDays,
              deviceLimit: campaign.deviceLimit,
              lteEnabled: campaign.lteEnabled,
              isTest: campaign.isTest,
            }),
            correlationId: correlationId(),
          },
        })
        await tx.systemState.create({
          data: {
            key: requestKey,
            valueJson: JSON.stringify({
              action: "PROMO_CAMPAIGN_CREATED",
              campaignId: campaign.id,
            }),
          },
        })
        return true
      })
    )
    revalidatePath("/admin/promos")
    return {
      status: "success",
      message: created
        ? "Черновик промокампании создан."
        : "Эта кампания уже была создана.",
    }
  } catch (error) {
    if (isUniqueConstraintError(error))
      return {
        status: "error",
        message: "Кампания с таким системным именем уже существует.",
        fieldErrors: { slug: "Выберите другое системное имя." },
      }
    return {
      status: "error",
      message: "Не удалось создать кампанию. Повторите попытку.",
    }
  }
}

export async function setPromoCampaignStatus(
  _previousState: PromoActionState,
  formData: FormData
): Promise<PromoActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = statusSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    return { status: "error", message: "Некорректная команда." }

  const value = parsed.data
  const isTest = getConfig().testMode
  try {
    const result = await withBusyRetry(() =>
      db.$transaction(async (tx) => {
        const campaign = await tx.promoCampaign.findUnique({
          where: { id: value.campaignId },
        })
        if (!campaign || campaign.isTest !== isTest)
          return { found: false, changed: false, active: false }

        const now = new Date()
        if (value.intent === "activate") {
          if (campaign.endsAt && campaign.endsAt <= now)
            throw new PromoCampaignExpiredError()
          if (campaign.status === "ACTIVE")
            return { found: true, changed: false, active: true }

          const pausedCampaigns = await tx.promoCampaign.findMany({
            where: {
              isTest,
              status: "ACTIVE",
              id: { not: campaign.id },
            },
            select: { id: true },
          })
          if (pausedCampaigns.length)
            await tx.promoCampaign.updateMany({
              where: { id: { in: pausedCampaigns.map((item) => item.id) } },
              data: { status: "PAUSED" },
            })

          const startsAt = campaign.startsAt ?? now
          const endsAt =
            campaign.endsAt ??
            new Date(
              now.getTime() + campaign.registrationWindowDays * 86_400_000
            )
          await tx.promoCampaign.update({
            where: { id: campaign.id },
            data: { status: "ACTIVE", startsAt, endsAt },
          })
          await tx.auditLog.create({
            data: {
              actorType: "ADMIN",
              actorId: session.userId,
              action: "PROMO_CAMPAIGN_ACTIVATED",
              entityType: "PromoCampaign",
              entityId: campaign.id,
              metadataJson: JSON.stringify({
                startsAt,
                endsAt,
                pausedCampaignIds: pausedCampaigns.map((item) => item.id),
              }),
              correlationId: correlationId(),
            },
          })
          return { found: true, changed: true, active: true }
        }

        if (campaign.status !== "ACTIVE")
          return { found: true, changed: false, active: false }
        await tx.promoCampaign.update({
          where: { id: campaign.id },
          data: { status: "PAUSED" },
        })
        await tx.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: session.userId,
            action: "PROMO_CAMPAIGN_PAUSED",
            entityType: "PromoCampaign",
            entityId: campaign.id,
            correlationId: correlationId(),
          },
        })
        return { found: true, changed: true, active: false }
      })
    )
    if (!result.found)
      return { status: "error", message: "Кампания не найдена." }

    revalidatePath("/admin/promos")
    return {
      status: "success",
      message: result.changed
        ? result.active
          ? "Промокампания запущена."
          : "Промокампания приостановлена."
        : result.active
          ? "Промокампания уже активна."
          : "Промокампания уже приостановлена.",
    }
  } catch (error) {
    if (error instanceof PromoCampaignExpiredError)
      return {
        status: "error",
        message: "Срок этой кампании закончился. Создайте новую кампанию.",
      }
    return {
      status: "error",
      message: "Не удалось изменить статус кампании.",
    }
  }
}
