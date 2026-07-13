export const EXPECTED_MIGRATIONS = [
  "20260713003000_init",
  "20260713015000_billing_reconciliation_guards",
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
