export type PreviewIdentity = {
  provider: "EMAIL" | "TELEGRAM"
  providerSubject: string
}

export type PreviewSubscriptionStatus =
  "NONE" | "TRIAL" | "ACTIVE" | "EXPIRED" | "CANCELED"

export type PreviewSubscription = {
  createdAt: Date
  deviceLimit: number
  expiresAt: Date | null
  id: string
  lastTechnicalError: string | null
  lastUserFriendlyError: string | null
  lteEnabled: boolean
  nextDeviceLimit: number | null
  nextLteEnabled: boolean | null
  nextParametersAt: Date | null
  startsAt: Date | null
  status: PreviewSubscriptionStatus
  subscriptionUrl: string | null
  syncStatus: "NOT_REQUIRED" | "PENDING" | "SYNCED" | "FAILED"
}

export type PreviewDurationOption = {
  discountPct: number
  months: number
  totalRub: number
}

export type PreviewPricing = {
  baseMonthlyPriceRub: number
  pricingVersion: number
  durationOptions: PreviewDurationOption[]
  extraDeviceMonthlyPriceRub: number
  deviceLimitUpgradePriceRub: number
  lteMonthlyPriceRub: number
  maxDeviceLimit: number
  minDeviceLimit: number
  minimalPayoutRub: number
  referralFriendDiscountPct: number
  referralRewardRub: number
  referralTrialDays: number
}
