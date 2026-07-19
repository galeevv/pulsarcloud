export const PAYOUT_FILTERS = [
  "pending",
  "approved",
  "paid",
  "rejected",
] as const

export type PayoutFilter = (typeof PAYOUT_FILTERS)[number]

export function parsePayoutFilter(value: string | undefined): PayoutFilter {
  return PAYOUT_FILTERS.includes(value as PayoutFilter)
    ? (value as PayoutFilter)
    : "pending"
}
