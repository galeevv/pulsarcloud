export const EXPECTED_MIGRATIONS = [
  "20260713003000_init",
  "20260713015000_billing_reconciliation_guards",
  "20260714190000_pricing_wallet_payment",
  "20260714220000_immediate_subscription_options",
  "20260714223000_trial_lte_and_notifications",
  "20260714234000_subscription_devices_and_upgrades",
  "20260718120000_admin_plans_and_support_notes",
  "20260718133000_subscription_plan_duration",
] as const

export type MigrationRecord = {
  migrationName: string
  finishedAt: Date | string | null
  rolledBackAt: Date | string | null
}

export function evaluateMigrationReadiness(
  records: readonly MigrationRecord[]
) {
  const byName = new Map(
    records.map((record) => [record.migrationName, record])
  )
  const complete = EXPECTED_MIGRATIONS.filter((migrationName) => {
    const record = byName.get(migrationName)
    return Boolean(record?.finishedAt && !record.rolledBackAt)
  })
  return {
    expected: EXPECTED_MIGRATIONS.length,
    complete: complete.length,
    ready: complete.length === EXPECTED_MIGRATIONS.length,
  }
}
