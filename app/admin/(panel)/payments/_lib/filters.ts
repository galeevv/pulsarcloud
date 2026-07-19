export const PAYMENT_FILTERS = [
  "all",
  "successful",
  "pending",
  "failed",
  "refunded",
] as const

export const PAYMENT_PERIODS = ["7d", "30d", "90d", "all"] as const

export const PAYMENT_SORTS = [
  "newest",
  "oldest",
  "amount-desc",
  "amount-asc",
] as const

export type PaymentFilter = (typeof PAYMENT_FILTERS)[number]
export type PaymentPeriod = (typeof PAYMENT_PERIODS)[number]
export type PaymentSort = (typeof PAYMENT_SORTS)[number]

export function parsePaymentFilter(value: string | undefined): PaymentFilter {
  return PAYMENT_FILTERS.includes(value as PaymentFilter)
    ? (value as PaymentFilter)
    : "all"
}

export function parsePaymentPeriod(value: string | undefined): PaymentPeriod {
  return PAYMENT_PERIODS.includes(value as PaymentPeriod)
    ? (value as PaymentPeriod)
    : "30d"
}

export function parsePaymentSort(value: string | undefined): PaymentSort {
  return PAYMENT_SORTS.includes(value as PaymentSort)
    ? (value as PaymentSort)
    : "newest"
}
