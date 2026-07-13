import "dotenv/config"
import { randomUUID } from "node:crypto"
import { db, initializeDatabase } from "@/src/server/infrastructure/db/client"
import { getConfig } from "@/src/server/config"
import { handleJob } from "@/src/jobs/handlers"
import { logger } from "@/src/server/infrastructure/logging/logger"

const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`
let stopping = false
let lastSubscriptionMinute = ""
let lastPaymentHour = ""
let lastCleanupBucket = -1
let lastHeartbeatAt = 0
let lastLeaseRecoveryAt = 0

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function heartbeat() {
  if (Date.now() - lastHeartbeatAt < 5_000) return
  await db.systemState.upsert({
    where: { key: "worker_heartbeat" },
    create: {
      key: "worker_heartbeat",
      valueJson: JSON.stringify({ workerId, at: new Date().toISOString() }),
    },
    update: {
      valueJson: JSON.stringify({ workerId, at: new Date().toISOString() }),
    },
  })
  lastHeartbeatAt = Date.now()
}

async function ensureMaintenanceJobs() {
  const now = new Date()
  const minuteBucket = now.toISOString().slice(0, 16)
  const hourBucket = now.toISOString().slice(0, 13)
  const cleanupBucket = Math.floor(now.getTime() / (6 * 60 * 60_000))
  const writes: Array<Promise<unknown>> = []
  if (minuteBucket !== lastSubscriptionMinute)
    writes.push(
      db.outboxJob.upsert({
        where: { dedupeKey: `maintenance:subscriptions:${minuteBucket}` },
        create: {
          type: "RECONCILE_SUBSCRIPTIONS",
          aggregateType: "System",
          aggregateId: "subscriptions",
          payloadJson: JSON.stringify({ scheduledAt: now.toISOString() }),
          dedupeKey: `maintenance:subscriptions:${minuteBucket}`,
          maxAttempts: 5,
        },
        update: {},
      })
    )
  if (hourBucket !== lastPaymentHour)
    writes.push(
      db.outboxJob.upsert({
        where: { dedupeKey: `maintenance:payments:${hourBucket}` },
        create: {
          type: "RECONCILE_PENDING_PAYMENTS",
          aggregateType: "System",
          aggregateId: "payments",
          payloadJson: JSON.stringify({ scheduledAt: now.toISOString() }),
          dedupeKey: `maintenance:payments:${hourBucket}`,
          maxAttempts: 5,
        },
        update: {},
      })
    )
  if (cleanupBucket !== lastCleanupBucket)
    writes.push(
      db.outboxJob.upsert({
        where: { dedupeKey: `maintenance:cleanup:${cleanupBucket}` },
        create: {
          type: "CLEANUP_WEBHOOK_LOGS",
          aggregateType: "System",
          aggregateId: "cleanup",
          payloadJson: JSON.stringify({ scheduledAt: now.toISOString() }),
          dedupeKey: `maintenance:cleanup:${cleanupBucket}`,
          maxAttempts: 5,
        },
        update: {},
      })
    )
  await Promise.all(writes)
  lastSubscriptionMinute = minuteBucket
  lastPaymentHour = hourBucket
  lastCleanupBucket = cleanupBucket
}

async function recoverLeases() {
  const recoveryInterval = Math.max(
    1_000,
    Math.floor(getConfig().worker.leaseMs / 2)
  )
  if (Date.now() - lastLeaseRecoveryAt < recoveryInterval) return
  const expired = new Date(Date.now() - getConfig().worker.leaseMs)
  await db.outboxJob.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: expired } },
    data: {
      status: "FAILED",
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(),
    },
  })
  lastLeaseRecoveryAt = Date.now()
}

async function claimOne() {
  const candidate = await db.outboxJob.findFirst({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      runAfter: { lte: new Date() },
    },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
  })
  if (!candidate) return null
  const claimed = await db.outboxJob.updateMany({
    where: { id: candidate.id, status: candidate.status },
    data: {
      status: "PROCESSING",
      lockedAt: new Date(),
      lockedBy: workerId,
      attempts: { increment: 1 },
    },
  })
  return claimed.count
    ? db.outboxJob.findUnique({ where: { id: candidate.id } })
    : null
}

async function finishFailure(
  job: NonNullable<Awaited<ReturnType<typeof claimOne>>>,
  error: unknown
) {
  const dead = job.attempts >= job.maxAttempts
  const backoff = Math.min(
    60 * 60_000,
    2 ** Math.min(job.attempts, 12) * 1000 + Math.floor(Math.random() * 1000)
  )
  await db.outboxJob.updateMany({
    where: { id: job.id, status: "PROCESSING", lockedBy: workerId },
    data: {
      status: dead ? "DEAD" : "FAILED",
      lockedAt: null,
      lockedBy: null,
      lastError:
        error instanceof Error ? error.message.slice(0, 2000) : String(error),
      runAfter: new Date(Date.now() + backoff),
    },
  })
}

async function tick() {
  await heartbeat()
  await recoverLeases()
  await ensureMaintenanceJobs()
  for (
    let index = 0;
    index < getConfig().worker.batchSize && !stopping;
    index += 1
  ) {
    const job = await claimOne()
    if (!job) break
    const leaseRenewal = setInterval(
      () => {
        void db.outboxJob
          .updateMany({
            where: { id: job.id, status: "PROCESSING", lockedBy: workerId },
            data: { lockedAt: new Date() },
          })
          .then(() => heartbeat())
          .catch((error) =>
            logger.error("job lease renewal failed", {
              jobId: job.id,
              error: error instanceof Error ? error.message : String(error),
            })
          )
      },
      Math.max(1_000, Math.floor(getConfig().worker.leaseMs / 3))
    )
    try {
      await handleJob(job)
      await db.outboxJob.updateMany({
        where: { id: job.id, status: "PROCESSING", lockedBy: workerId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      })
    } catch (error) {
      logger.error("job failed", {
        jobId: job.id,
        type: job.type,
        attempt: job.attempts,
      })
      await finishFailure(job, error)
    } finally {
      clearInterval(leaseRenewal)
      await heartbeat()
    }
  }
}

async function main() {
  await initializeDatabase()
  logger.info("worker started", { workerId })
  while (!stopping) {
    await tick()
    await delay(getConfig().worker.pollIntervalMs)
  }
  await db.$disconnect()
  logger.info("worker stopped", { workerId })
}

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true
  })
main().catch((error) => {
  logger.error("worker crashed", {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
