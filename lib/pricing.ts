import type { PricingVersion } from "@/generated/prisma/client"

export type DurationDiscount = {
  months: number
  discountPct: number
}

export type SubscriptionPriceInput = {
  months: number
  deviceLimit: number
  lteEnabled: boolean
  referralDiscountPct?: number
}

export function getDurationDiscounts(settings: PricingVersion) {
  if (!Array.isArray(settings.durationDiscounts)) {
    return []
  }

  return settings.durationDiscounts.filter(
    (item): item is DurationDiscount =>
      typeof item === "object" &&
      item !== null &&
      "months" in item &&
      "discountPct" in item &&
      typeof item.months === "number" &&
      typeof item.discountPct === "number"
  )
}

export function calculateSubscriptionPriceRub(
  settings: PricingVersion,
  input: SubscriptionPriceInput
) {
  return calculateSubscriptionPrice(settings, input).totalRub
}

export function calculateSubscriptionPrice(
  settings: PricingVersion,
  input: SubscriptionPriceInput
) {
  const normalizedDeviceLimit = Math.min(
    Math.max(input.deviceLimit, settings.minDeviceLimit),
    settings.maxDeviceLimit
  )
  const extraDevices = Math.max(0, normalizedDeviceLimit - 1)
  const monthly =
    settings.baseMonthlyPriceRub +
    extraDevices * settings.extraDeviceMonthlyPriceRub +
    (input.lteEnabled ? settings.lteMonthlyPriceRub : 0)
  const subtotal = monthly * input.months
  const durationDiscount =
    getDurationDiscounts(settings).find((item) => item.months === input.months)
      ?.discountPct ?? 0
  const afterDurationDiscount = Math.round(
    subtotal * (1 - durationDiscount / 100)
  )
  const referralDiscountPct = input.referralDiscountPct ?? 0

  const totalRub = Math.max(
    0,
    Math.round(afterDurationDiscount * (1 - referralDiscountPct / 100))
  )

  return {
    monthlyRub: monthly,
    subtotalRub: subtotal,
    durationDiscountPct: durationDiscount,
    referralDiscountPct,
    discountRub: subtotal - totalRub,
    totalRub,
  }
}

export function formatRub(amountRub: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "RUB",
  }).format(amountRub)
}
