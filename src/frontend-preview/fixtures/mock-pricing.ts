import type { PreviewPricing } from "@/src/frontend-preview/view-models"

export const previewPricing: PreviewPricing = {
  baseMonthlyPriceRub: 119,
  durationOptions: [
    { months: 1, discountPct: 0, totalRub: 119 },
    { months: 3, discountPct: 10, totalRub: 321 },
    { months: 6, discountPct: 15, totalRub: 607 },
    { months: 12, discountPct: 20, totalRub: 1_142 },
  ],
  extraDeviceMonthlyPriceRub: 50,
  lteMonthlyPriceRub: 50,
  maxDeviceLimit: 5,
  minDeviceLimit: 1,
  minimalPayoutRub: 150,
  referralFriendDiscountPct: 0,
  referralRewardRub: 75,
}
