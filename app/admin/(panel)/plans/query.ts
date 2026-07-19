import { getConfig } from "@/src/server/config"
import {
  availableDurationMonths,
  calculatePrice,
  durationDays,
  type DurationMonths,
} from "@/src/server/domain/billing/pricing"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

const planMonths = [1, 3, 6, 12] as const

type PricingSnapshot = {
  baseMonthlyPriceMinor: number
  extraDeviceMonthlyPriceMinor: number
  deviceLimitUpgradePriceMinor: number
  lteMonthlyPriceMinor: number
  durationDiscounts: Record<string, number>
  planNames: Record<string, string>
  availableDurations: DurationMonths[]
  minDeviceLimit: number
  maxDeviceLimit: number
  referralRewardMinor: number
  referralTrialDays: number
  minimalPayoutMinor: number
}

function parseDiscounts(value: string): Record<string, number> {
  const result: Record<string, number> = {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    for (const months of planMonths) {
      const discount = parsed[String(months)]
      result[String(months)] = typeof discount === "number" ? discount : 0
    }
  } catch {
    for (const months of planMonths) result[String(months)] = 0
  }
  return result
}

function parsePlanNames(value: string): Record<string, string> {
  const result: Record<string, string> = {}
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(value) as Record<string, unknown>
  } catch {
    // Invalid historic data falls back to the stable duration labels below.
  }
  for (const months of planMonths) {
    const name = parsed[String(months)]
    result[String(months)] =
      typeof name === "string" && name.trim()
        ? name.trim()
        : months === 1
          ? "1 месяц"
          : months < 5
            ? `${months} месяца`
            : `${months} месяцев`
  }
  return result
}

type PricingAuditChange = {
  label: string
  before: string
  after: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function safeInteger(
  snapshot: Record<string, unknown>,
  key: string
): number | null {
  const value = snapshot[key]
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= 1_000_000_000
    ? value
    : null
}

function formatMinor(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(value / 100)
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || value.length > 4_000) return null
  try {
    return asRecord(JSON.parse(value))
  } catch {
    return null
  }
}

function formatDiscounts(value: unknown) {
  const parsed = parseJsonRecord(value)
  if (!parsed) return null
  const entries: string[] = []
  for (const months of planMonths) {
    const discount = parsed[String(months)]
    if (
      typeof discount !== "number" ||
      !Number.isInteger(discount) ||
      discount < 0 ||
      discount > 100
    )
      return null
    entries.push(`${months} мес.: ${discount}%`)
  }
  return entries.join(" · ")
}

function formatPlanNames(value: unknown) {
  const parsed = parseJsonRecord(value)
  if (!parsed) return null
  const entries: string[] = []
  for (const months of planMonths) {
    const name = parsed[String(months)]
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 60
    )
      return null
    entries.push(`${months} мес.: ${name.trim()}`)
  }
  return entries.join(" · ")
}

function formatAvailableDurations(value: unknown) {
  if (typeof value !== "string" || value.length > 1_000) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return null
    const durations = planMonths.filter((months) => parsed.includes(months))
    return durations.length
      ? durations.map((months) => `${months} мес.`).join(", ")
      : "Нет доступных сроков"
  } catch {
    return null
  }
}

function pricingChanges(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): PricingAuditChange[] {
  const changes: PricingAuditChange[] = []
  const add = (label: string, before: string | null, after: string | null) => {
    if (before !== null && after !== null && before !== after)
      changes.push({ label, before, after })
  }
  const money = (snapshot: Record<string, unknown>, key: string) => {
    const value = safeInteger(snapshot, key)
    return value === null ? null : formatMinor(value)
  }
  const integer = (snapshot: Record<string, unknown>, key: string) => {
    const value = safeInteger(snapshot, key)
    return value === null ? null : new Intl.NumberFormat("ru-RU").format(value)
  }

  add(
    "База за месяц",
    money(previous, "baseMonthlyPriceMinor"),
    money(next, "baseMonthlyPriceMinor")
  )
  add(
    "Дополнительное устройство",
    money(previous, "extraDeviceMonthlyPriceMinor"),
    money(next, "extraDeviceMonthlyPriceMinor")
  )
  add(
    "Увеличение лимита",
    money(previous, "deviceLimitUpgradePriceMinor"),
    money(next, "deviceLimitUpgradePriceMinor")
  )
  add(
    "LTE за месяц",
    money(previous, "lteMonthlyPriceMinor"),
    money(next, "lteMonthlyPriceMinor")
  )
  add(
    "Скидки по срокам",
    formatDiscounts(previous.durationDiscountsJson),
    formatDiscounts(next.durationDiscountsJson)
  )
  add(
    "Названия тарифов",
    formatPlanNames(previous.planNamesJson),
    formatPlanNames(next.planNamesJson)
  )
  add(
    "Доступные сроки",
    formatAvailableDurations(previous.availableDurationsJson),
    formatAvailableDurations(next.availableDurationsJson)
  )
  add(
    "Устройств включено",
    integer(previous, "minDeviceLimit"),
    integer(next, "minDeviceLimit")
  )
  add(
    "Максимум устройств",
    integer(previous, "maxDeviceLimit"),
    integer(next, "maxDeviceLimit")
  )
  add(
    "Реферальная награда",
    money(previous, "referralRewardMinor"),
    money(next, "referralRewardMinor")
  )
  add(
    "Пробный период",
    integer(previous, "referralTrialDays"),
    integer(next, "referralTrialDays")
  )
  add(
    "Минимальная выплата",
    money(previous, "minimalPayoutMinor"),
    money(next, "minimalPayoutMinor")
  )
  return changes
}

function parsePricingAudit(value: string | null) {
  if (!value || value.length > 100_000) return null
  try {
    const metadata = asRecord(JSON.parse(value))
    if (!metadata) return null
    const previous = asRecord(metadata.previous)
    const next = asRecord(metadata.next)
    return {
      previousVersion:
        typeof metadata.previousVersion === "number" &&
        Number.isSafeInteger(metadata.previousVersion)
          ? metadata.previousVersion
          : null,
      nextVersion:
        typeof metadata.nextVersion === "number" &&
        Number.isSafeInteger(metadata.nextVersion)
          ? metadata.nextVersion
          : null,
      reason:
        typeof metadata.reason === "string"
          ? metadata.reason.trim().slice(0, 500)
          : null,
      changes: previous && next ? pricingChanges(previous, next) : [],
    }
  } catch {
    return null
  }
}

export async function getAdminPlansView() {
  await requireWebSession("ADMIN")

  const now = new Date()
  const config = getConfig()
  const [
    pricing,
    activeSubscriptions,
    activeSubscriptionCounts,
    historyRows,
  ] = await Promise.all([
    db.pricingSettings.findUniqueOrThrow({ where: { key: "default" } }),
    db.subscription.count({
      where: {
        status: { in: ["ACTIVE", "TRIAL"] },
        expiresAt: { gt: now },
        user: { role: "USER", isTest: config.testMode },
      },
    }),
    db.subscription.groupBy({
      by: ["planDurationMonths"],
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now },
        planDurationMonths: { not: null },
        user: { role: "USER", isTest: config.testMode },
      },
      _count: { _all: true },
    }),
    db.auditLog.findMany({
      where: {
        entityType: "PricingSettings",
        entityId: "default",
        action: "PRICING_UPDATED",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        metadataJson: true,
      },
    }),
  ])

  const durationDiscounts = parseDiscounts(pricing.durationDiscountsJson)
  const planNames = parsePlanNames(pricing.planNamesJson)
  const availableDurations = availableDurationMonths(pricing)
  const activeSubscriptionsByDuration = new Map(
    activeSubscriptionCounts.map((row) => [
      row.planDurationMonths,
      row._count._all,
    ])
  )
  const snapshot: PricingSnapshot = {
    baseMonthlyPriceMinor: pricing.baseMonthlyPriceMinor,
    extraDeviceMonthlyPriceMinor: pricing.extraDeviceMonthlyPriceMinor,
    deviceLimitUpgradePriceMinor: pricing.deviceLimitUpgradePriceMinor,
    lteMonthlyPriceMinor: pricing.lteMonthlyPriceMinor,
    durationDiscounts,
    planNames,
    availableDurations,
    minDeviceLimit: pricing.minDeviceLimit,
    maxDeviceLimit: pricing.maxDeviceLimit,
    referralRewardMinor: pricing.referralRewardMinor,
    referralTrialDays: pricing.referralTrialDays,
    minimalPayoutMinor: pricing.minimalPayoutMinor,
  }

  return {
    generatedAt: now,
    pricing: {
      ...snapshot,
      version: pricing.version,
      updatedAt: pricing.updatedAt,
    },
    plans: planMonths.map((months) => {
      const quote = calculatePrice(pricing, {
        durationMonths: months,
        deviceLimit: pricing.minDeviceLimit,
        lteEnabled: false,
        allowUnavailable: true,
      })
      return {
        name: planNames[String(months)],
        months,
        available: availableDurations.includes(months),
        durationDays: durationDays[months as DurationMonths],
        discountPct: durationDiscounts[String(months)] ?? 0,
        amountMinor: quote.amountMinor,
        monthlyAmountMinor: Math.round(quote.amountMinor / months),
        activeSubscriptions:
          activeSubscriptionsByDuration.get(months) ?? 0,
      }
    }),
    activeSubscriptions,
    history: historyRows.map((row) => {
      const audit = parsePricingAudit(row.metadataJson)
      return {
        id: row.id,
        createdAt: row.createdAt,
        previousVersion: audit?.previousVersion ?? null,
        nextVersion: audit?.nextVersion ?? null,
        reason: audit?.reason ?? null,
        changes: audit?.changes ?? [],
      }
    }),
  }
}

export type AdminPlansView = Awaited<ReturnType<typeof getAdminPlansView>>
