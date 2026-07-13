import { databaseHealth, db } from "@/src/server/infrastructure/db/client"
import { Prisma } from "@/src/generated/prisma/client"
import { getConfig } from "@/src/server/config"
import { logger } from "@/src/server/infrastructure/logging/logger"
import {
  evaluateMigrationReadiness,
  EXPECTED_MIGRATIONS,
  type MigrationRecord,
} from "@/src/server/infrastructure/db/migrations"
export async function GET() {
  try {
    const database = await databaseHealth()
    const migrations = await db.$queryRaw<MigrationRecord[]>(Prisma.sql`
      SELECT migration_name AS "migrationName",
             finished_at AS "finishedAt",
             rolled_back_at AS "rolledBackAt"
      FROM _prisma_migrations
      WHERE migration_name IN (${Prisma.join([...EXPECTED_MIGRATIONS])})
    `)
    const migrationReadiness = evaluateMigrationReadiness(migrations)
    const heartbeat = await db.systemState.findUnique({
      where: { key: "worker_heartbeat" },
    })
    const parsed = heartbeat
      ? (JSON.parse(heartbeat.valueJson) as { at?: string })
      : null
    const workerReady = Boolean(
      parsed?.at &&
      Date.now() - new Date(parsed.at).getTime() <
        Math.max(60_000, getConfig().worker.pollIntervalMs * 10)
    )
    const status = workerReady && migrationReadiness.ready ? 200 : 503
    return Response.json(
      {
        status: status === 200 ? "ready" : "degraded",
        database,
        migrations: migrationReadiness.complete,
        expectedMigrations: migrationReadiness.expected,
        migrationsReady: migrationReadiness.ready,
        workerReady,
        billingEnabled: getConfig().payments.enabled,
      },
      { status }
    )
  } catch (error) {
    logger.error("readiness check failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      {
        status: "not_ready",
        error: "dependency_check_failed",
      },
      { status: 503 }
    )
  }
}
