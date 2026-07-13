import type { PricingSettings } from "@/src/generated/prisma/client"
import { BusinessError } from "@/src/server/application/errors"

export const durationDays = { 1: 30, 3: 90, 6: 180, 12: 365 } as const
export type DurationMonths = keyof typeof durationDays

export type PriceQuote = {
  amountMinor: number
  durationDays: number
  deviceLimit: number
  lteEnabled: boolean
  basePriceMinor: number
  extraDevicesPriceMinor: number
  ltePriceMinor: number
  discountMinor: number
  pricingVersion: number
  snapshotJson: string
}

export function calculatePrice(
  settings: PricingSettings,
  input: { durationMonths: number; deviceLimit: number; lteEnabled: boolean }
): PriceQuote {
  if (
    ![1, 3, 6, 12].includes(input.durationMonths) ||
    input.deviceLimit < settings.minDeviceLimit ||
    input.deviceLimit > settings.maxDeviceLimit
  ) {
    throw new BusinessError("PAYMENT_INVALID_PARAMETERS")
  }
  const discounts = JSON.parse(settings.durationDiscountsJson) as Record<
    string,
    number
  >
  const months = input.durationMonths as DurationMonths
  const basePriceMinor = settings.baseMonthlyPriceMinor * months
  const extraDevicesPriceMinor =
    Math.max(0, input.deviceLimit - settings.minDeviceLimit) *
    settings.extraDeviceMonthlyPriceMinor *
    months
  const ltePriceMinor = input.lteEnabled
    ? settings.lteMonthlyPriceMinor * months
    : 0
  const subtotalMinor = basePriceMinor + extraDevicesPriceMinor + ltePriceMinor
  const discountPct = discounts[String(months)] ?? 0
  const discountMinor = Math.round((subtotalMinor * discountPct) / 100)
  const amountMinor = subtotalMinor - discountMinor
  const snapshot = {
    months,
    durationDays: durationDays[months],
    deviceLimit: input.deviceLimit,
    lteEnabled: input.lteEnabled,
    basePriceMinor,
    extraDevicesPriceMinor,
    ltePriceMinor,
    discountPct,
    discountMinor,
    amountMinor,
    currency: "RUB",
    pricingVersion: settings.version,
  }
  return {
    amountMinor,
    durationDays: durationDays[months],
    deviceLimit: input.deviceLimit,
    lteEnabled: input.lteEnabled,
    basePriceMinor,
    extraDevicesPriceMinor,
    ltePriceMinor,
    discountMinor,
    pricingVersion: settings.version,
    snapshotJson: JSON.stringify(snapshot),
  }
}
