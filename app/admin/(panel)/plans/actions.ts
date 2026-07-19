"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { db } from "@/src/server/infrastructure/db/client"
import { correlationId } from "@/src/server/infrastructure/security/crypto"
import { requireWebSession } from "@/src/server/transport/web/session"

const moneySchema = z.coerce.number().finite().min(0).max(1_000_000)
const availabilitySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")

const pricingSchema = z
  .object({
    baseRub: moneySchema.positive(),
    extraDeviceRub: moneySchema,
    deviceUpgradeRub: moneySchema.positive(),
    lteRub: moneySchema,
    discount1: z.coerce.number().int().min(0).max(90),
    discount3: z.coerce.number().int().min(0).max(90),
    discount6: z.coerce.number().int().min(0).max(90),
    discount12: z.coerce.number().int().min(0).max(90),
    planName1: z.string().trim().min(2).max(60),
    planName3: z.string().trim().min(2).max(60),
    planName6: z.string().trim().min(2).max(60),
    planName12: z.string().trim().min(2).max(60),
    available1: availabilitySchema,
    available3: availabilitySchema,
    available6: availabilitySchema,
    available12: availabilitySchema,
    minDevices: z.coerce.number().int().min(1).max(5),
    maxDevices: z.coerce.number().int().min(1).max(5),
    referralRewardRub: moneySchema,
    referralTrialDays: z.coerce.number().int().min(1).max(365),
    minimalPayoutRub: moneySchema,
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: z.uuid(),
    expectedVersion: z.coerce.number().int().positive(),
  })
  .refine((value) => value.minDevices <= value.maxDevices, {
    path: ["maxDevices"],
    message: "Максимум устройств не может быть меньше минимума.",
  })
  .refine(
    (value) =>
      value.available1 ||
      value.available3 ||
      value.available6 ||
      value.available12,
    {
      path: ["available1"],
      message: "Оставьте доступным хотя бы один тариф.",
    }
  )

export type PricingActionState = {
  status: "idle" | "success" | "error"
  message: string
  version?: number
  fieldErrors?: {
    baseRub?: string
    extraDeviceRub?: string
    deviceUpgradeRub?: string
    lteRub?: string
    planNames?: string
    availability?: string
    maxDevices?: string
    reason?: string
  }
}

class PricingVersionConflictError extends Error {
  readonly name = "PricingVersionConflictError"
}

function toMinor(value: number) {
  return Math.round(value * 100)
}

export async function updatePricingSettings(
  _previousState: PricingActionState,
  formData: FormData
): Promise<PricingActionState> {
  const session = await requireWebSession("ADMIN")
  const parsed = pricingSchema.safeParse({
    ...Object.fromEntries(formData),
    available1: String(formData.get("available1") ?? "false"),
    available3: String(formData.get("available3") ?? "false"),
    available6: String(formData.get("available6") ?? "false"),
    available12: String(formData.get("available12") ?? "false"),
  })

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return {
      status: "error",
      message: "Проверьте значения в форме.",
      fieldErrors: {
        baseRub: errors.baseRub?.[0],
        extraDeviceRub: errors.extraDeviceRub?.[0],
        deviceUpgradeRub: errors.deviceUpgradeRub?.[0],
        lteRub: errors.lteRub?.[0],
        planNames:
          errors.planName1?.[0] ??
          errors.planName3?.[0] ??
          errors.planName6?.[0] ??
          errors.planName12?.[0],
        availability:
          errors.available1?.[0] ??
          errors.available3?.[0] ??
          errors.available6?.[0] ??
          errors.available12?.[0],
        maxDevices: errors.maxDevices?.[0],
        reason: errors.reason?.[0],
      },
    }
  }

  const value = parsed.data
  const durationDiscounts = {
    1: value.discount1,
    3: value.discount3,
    6: value.discount6,
    12: value.discount12,
  }
  const planNames = {
    1: value.planName1,
    3: value.planName3,
    6: value.planName6,
    12: value.planName12,
  }
  const availableDurations = [
    value.available1 ? 1 : null,
    value.available3 ? 3 : null,
    value.available6 ? 6 : null,
    value.available12 ? 12 : null,
  ].filter((months): months is number => months !== null)
  const nextValues = {
    baseMonthlyPriceMinor: toMinor(value.baseRub),
    extraDeviceMonthlyPriceMinor: toMinor(value.extraDeviceRub),
    deviceLimitUpgradePriceMinor: toMinor(value.deviceUpgradeRub),
    lteMonthlyPriceMinor: toMinor(value.lteRub),
    durationDiscountsJson: JSON.stringify(durationDiscounts),
    planNamesJson: JSON.stringify(planNames),
    availableDurationsJson: JSON.stringify(availableDurations),
    minDeviceLimit: value.minDevices,
    maxDeviceLimit: value.maxDevices,
    referralRewardMinor: toMinor(value.referralRewardRub),
    referralTrialDays: value.referralTrialDays,
    minimalPayoutMinor: toMinor(value.minimalPayoutRub),
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const stateKey = `admin-pricing-request:${session.userId}:${value.idempotencyKey}`
      const previousRequest = await tx.systemState.findUnique({
        where: { key: stateKey },
      })
      if (previousRequest) {
        const pricing = await tx.pricingSettings.findUniqueOrThrow({
          where: { key: "default" },
        })
        return { version: pricing.version, unchanged: true }
      }

      const previous = await tx.pricingSettings.findUniqueOrThrow({
        where: { key: "default" },
      })
      if (previous.version !== value.expectedVersion)
        throw new PricingVersionConflictError()
      const unchanged =
        previous.baseMonthlyPriceMinor === nextValues.baseMonthlyPriceMinor &&
        previous.extraDeviceMonthlyPriceMinor ===
          nextValues.extraDeviceMonthlyPriceMinor &&
        previous.deviceLimitUpgradePriceMinor ===
          nextValues.deviceLimitUpgradePriceMinor &&
        previous.lteMonthlyPriceMinor === nextValues.lteMonthlyPriceMinor &&
        previous.durationDiscountsJson === nextValues.durationDiscountsJson &&
        previous.planNamesJson === nextValues.planNamesJson &&
        previous.availableDurationsJson ===
          nextValues.availableDurationsJson &&
        previous.minDeviceLimit === nextValues.minDeviceLimit &&
        previous.maxDeviceLimit === nextValues.maxDeviceLimit &&
        previous.referralRewardMinor === nextValues.referralRewardMinor &&
        previous.referralTrialDays === nextValues.referralTrialDays &&
        previous.minimalPayoutMinor === nextValues.minimalPayoutMinor

      if (unchanged) return { version: previous.version, unchanged: true }

      await tx.systemState.create({
        data: {
          key: stateKey,
          valueJson: JSON.stringify({
            action: "PRICING_UPDATED",
            createdAt: new Date(),
          }),
        },
      })
      const changed = await tx.pricingSettings.updateMany({
        where: { key: "default", version: value.expectedVersion },
        data: {
          ...nextValues,
          version: { increment: 1 },
        },
      })
      if (!changed.count) throw new PricingVersionConflictError()
      const updated = await tx.pricingSettings.findUniqueOrThrow({
        where: { key: "default" },
      })
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: session.userId,
          action: "PRICING_UPDATED",
          entityType: "PricingSettings",
          entityId: "default",
          metadataJson: JSON.stringify({
            previousVersion: previous.version,
            nextVersion: updated.version,
            reason: value.reason,
            previous: {
              baseMonthlyPriceMinor: previous.baseMonthlyPriceMinor,
              extraDeviceMonthlyPriceMinor:
                previous.extraDeviceMonthlyPriceMinor,
              deviceLimitUpgradePriceMinor:
                previous.deviceLimitUpgradePriceMinor,
              lteMonthlyPriceMinor: previous.lteMonthlyPriceMinor,
              durationDiscountsJson: previous.durationDiscountsJson,
              planNamesJson: previous.planNamesJson,
              availableDurationsJson: previous.availableDurationsJson,
              minDeviceLimit: previous.minDeviceLimit,
              maxDeviceLimit: previous.maxDeviceLimit,
              referralRewardMinor: previous.referralRewardMinor,
              referralTrialDays: previous.referralTrialDays,
              minimalPayoutMinor: previous.minimalPayoutMinor,
            },
            next: nextValues,
          }),
          correlationId: correlationId(),
        },
      })
      return { version: updated.version, unchanged: false }
    })

    revalidatePath("/admin/plans")
    return {
      status: "success",
      message: result.unchanged
        ? "Настройки уже актуальны."
        : "Новая версия тарифов сохранена.",
      version: result.version,
    }
  } catch (error) {
    if (error instanceof PricingVersionConflictError)
      return {
        status: "error",
        message:
          "Тарифы уже изменены в другой вкладке. Закройте форму и откройте её снова.",
      }
    return {
      status: "error",
      message: "Не удалось сохранить тарифы. Повторите попытку.",
    }
  }
}
