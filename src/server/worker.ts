import { hostname } from "node:os"

import { JobStatus, JobType, type Job } from "@/generated/prisma/client"

import { IntegrationError } from "@/lib/application-errors"
import { prisma } from "@/lib/db"
import { runInTransaction } from "@/lib/transactions"

const workerId = `${hostname()}:${process.pid}`
const pollIntervalMs = 1_000
let stopping = false

process.once("SIGINT", stop)
process.once("SIGTERM", stop)

while (!stopping) {
  const job = await claimNextJob()

  if (!job) {
    await delay(pollIntervalMs)
    continue
  }

  try {
    await handleJob(job)
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.SUCCEEDED,
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    })
  } catch (error) {
    const attemptCount = job.attemptCount + 1
    await prisma.job.update({
      where: { id: job.id },
      data: {
        attemptCount,
        status:
          attemptCount >= job.maxAttempts ? JobStatus.FAILED : JobStatus.PENDING,
        runAt: new Date(Date.now() + retryDelay(attemptCount)),
        lockedAt: null,
        lockedBy: null,
        lastError: error instanceof Error ? error.message : "Unknown job error",
      },
    })
  }
}

await prisma.$disconnect()

function claimNextJob() {
  return runInTransaction(prisma, async (tx) => {
    const candidate = await tx.job.findFirst({
      where: { status: JobStatus.PENDING, runAt: { lte: new Date() } },
      orderBy: [{ runAt: "asc" }, { createdAt: "asc" }],
    })

    if (!candidate) {
      return null
    }

    const claimed = await tx.job.updateMany({
      where: { id: candidate.id, status: JobStatus.PENDING, lockedAt: null },
      data: {
        status: JobStatus.RUNNING,
        lockedAt: new Date(),
        lockedBy: workerId,
      },
    })

    return claimed.count === 1
      ? tx.job.findUniqueOrThrow({ where: { id: candidate.id } })
      : null
  })
}

async function handleJob(job: Job) {
  switch (job.type) {
    case JobType.EXPIRE_AUTH_CHALLENGES:
      await prisma.authChallenge.updateMany({
        where: { status: "PENDING", expiresAt: { lte: new Date() } },
        data: { status: "EXPIRED" },
      })
      return
    case JobType.DELETE_EXPIRED_SESSIONS:
      await prisma.session.deleteMany({
        where: { OR: [{ expiresAt: { lte: new Date() } }, { revokedAt: { not: null } }] },
      })
      return
    case JobType.SEND_AUTH_EMAIL:
    case JobType.SEND_PAYMENT_RECEIPT:
    case JobType.PROCESS_PAYMENT_WEBHOOK:
    case JobType.PROVISION_SUBSCRIPTION:
    case JobType.SYNC_SUBSCRIPTION:
    case JobType.PROCESS_TELEGRAM_UPDATE:
      throw new IntegrationError(
        `Job ${job.type} requires credentials and a production integration adapter.`,
        { jobId: job.id }
      )
  }
}

function retryDelay(attempt: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1))
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function stop() {
  stopping = true
}
