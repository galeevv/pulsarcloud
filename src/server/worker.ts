import { hostname } from "node:os"

import { JobStatus, JobType, type Job } from "@/generated/prisma/client"
import { AuthProvider } from "@/generated/prisma/client"
import { z } from "zod"

import { IntegrationError } from "@/lib/application-errors"
import { prisma } from "@/lib/db"
import { openJobPayload } from "@/lib/job-payload-crypto"
import { runInTransaction } from "@/lib/transactions"
import { sendTransactionalEmail } from "@/src/server/services/email/resend-client"
import { createSubscriptionProvisioningService } from "@/src/server/services/provisioning/subscription-provisioning-service"
import { sendTelegramMessage } from "@/src/server/services/telegram/bot-client"
import { processTelegramUpdate } from "@/src/server/services/telegram/update-service"

const workerId = `${hostname()}:${process.pid}`
const pollIntervalMs = 1_000
let stopping = false
let nextExpiryScanAt = 0

process.once("SIGINT", stop)
process.once("SIGTERM", stop)

while (!stopping) {
  await maybeEnqueueExpiryNotices()
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
          attemptCount >= job.maxAttempts
            ? JobStatus.FAILED
            : JobStatus.PENDING,
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
        where: {
          OR: [
            { expiresAt: { lte: new Date() } },
            { revokedAt: { not: null } },
          ],
        },
      })
      return
    case JobType.SEND_AUTH_EMAIL:
      await handleAuthEmail(job)
      return
    case JobType.SEND_PAYMENT_RECEIPT:
      await handlePaymentReceipt(job)
      return
    case JobType.SEND_SUBSCRIPTION_EXPIRY_NOTICE:
      await handleExpiryNotice(job)
      return
    case JobType.PROCESS_PAYMENT_WEBHOOK:
    case JobType.PROVISION_SUBSCRIPTION: {
      const payload = z
        .object({ subscriptionId: z.string() })
        .parse(job.payload)
      await createSubscriptionProvisioningService().provisionSubscription(
        payload.subscriptionId
      )
      return
    }
    case JobType.SYNC_SUBSCRIPTION: {
      const payload = z
        .object({ subscriptionId: z.string() })
        .parse(job.payload)
      await createSubscriptionProvisioningService().syncSubscription(
        payload.subscriptionId
      )
      return
    }
    case JobType.PROCESS_TELEGRAM_UPDATE: {
      const payload = z.object({ updateId: z.string() }).parse(job.payload)
      await processTelegramUpdate(BigInt(payload.updateId))
      return
    }
    case JobType.PROCESS_PAYMENT_WEBHOOK:
      throw new IntegrationError(
        `Job ${job.type} requires credentials and a production integration adapter.`,
        { jobId: job.id }
      )
  }
}

const sealedSchema = z.object({
  iv: z.string(),
  tag: z.string(),
  ciphertext: z.string(),
})

async function handleAuthEmail(job: Job) {
  const payload = z
    .object({
      challengeId: z.string(),
      email: z.string().email(),
      delivery: sealedSchema,
    })
    .parse(job.payload)
  const challenge = await prisma.authChallenge.findUnique({
    where: { id: payload.challengeId },
  })
  if (
    !challenge ||
    challenge.status !== "PENDING" ||
    challenge.expiresAt <= new Date()
  )
    return
  const delivery = openJobPayload<{ code: string; magicLink: string }>(
    payload.delivery
  )
  await sendTransactionalEmail({
    idempotencyKey: `auth-email/${payload.challengeId}`,
    to: payload.email,
    subject: "Вход в Pulsar",
    text: `Код: ${delivery.code}\nСсылка для входа: ${delivery.magicLink}\nДействует 10 минут.`,
    html: `<h1>Вход в Pulsar</h1><p>Код: <strong>${escapeHtml(delivery.code)}</strong></p><p><a href="${escapeHtml(delivery.magicLink)}">Войти в Pulsar</a></p><p>Код и ссылка действуют 10 минут.</p>`,
  })
}

async function handlePaymentReceipt(job: Job) {
  const payload = z
    .object({ paymentId: z.string(), userId: z.string() })
    .parse(job.payload)
  const payment = await prisma.payment.findUnique({
    where: { id: payload.paymentId },
    include: { user: { include: { authIdentities: true } } },
  })
  if (!payment || payment.status !== "SUCCEEDED") return
  const email = payment.user.authIdentities.find(
    (item) => item.provider === AuthProvider.EMAIL
  )?.providerSubject
  const telegramId = payment.user.authIdentities.find(
    (item) => item.provider === AuthProvider.TELEGRAM
  )?.providerSubject
  const text = `Оплата ${payment.amountRub} ₽ подтверждена. Подписка продлена на ${payment.durationMonths} мес.`
  if (email)
    await sendTransactionalEmail({
      idempotencyKey: `payment-receipt/${payment.id}`,
      to: email,
      subject: "Оплата Pulsar подтверждена",
      text,
      html: `<p>${escapeHtml(text)}</p>`,
    })
  if (telegramId) await sendTelegramMessage(telegramId, text)
}

async function maybeEnqueueExpiryNotices() {
  if (Date.now() < nextExpiryScanAt) return
  nextExpiryScanAt = Date.now() + 60 * 60 * 1000
  const now = new Date()
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: {
        gt: now,
        lte: new Date(now.getTime() + 72 * 60 * 60 * 1000),
      },
    },
    select: { id: true, expiresAt: true },
  })
  for (const subscription of subscriptions) {
    if (!subscription.expiresAt) continue
    const hours = (subscription.expiresAt.getTime() - now.getTime()) / 3_600_000
    const notice = hours <= 24 ? "1d" : hours > 48 ? "3d" : null
    if (!notice) continue
    await prisma.job.upsert({
      where: {
        idempotencyKey: `subscription:${subscription.id}:expiry:${notice}`,
      },
      update: {},
      create: {
        type: JobType.SEND_SUBSCRIPTION_EXPIRY_NOTICE,
        idempotencyKey: `subscription:${subscription.id}:expiry:${notice}`,
        payload: { subscriptionId: subscription.id, notice },
      },
    })
  }
}

async function handleExpiryNotice(job: Job) {
  const payload = z
    .object({ subscriptionId: z.string(), notice: z.enum(["3d", "1d"]) })
    .parse(job.payload)
  const subscription = await prisma.subscription.findUnique({
    where: { id: payload.subscriptionId },
    include: { user: { include: { authIdentities: true } } },
  })
  if (!subscription?.expiresAt || subscription.status !== "ACTIVE") return
  const email = subscription.user.authIdentities.find(
    (item) => item.provider === AuthProvider.EMAIL
  )?.providerSubject
  const telegramId = subscription.user.authIdentities.find(
    (item) => item.provider === AuthProvider.TELEGRAM
  )?.providerSubject
  const when = subscription.expiresAt.toLocaleString("ru-RU", {
    timeZone: "UTC",
  })
  const text = `Подписка Pulsar закончится ${when} UTC. Продлить: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pulsar-cloud.space"}/subscription`
  if (email)
    await sendTransactionalEmail({
      idempotencyKey: `subscription-expiry/${subscription.id}/${payload.notice}`,
      to: email,
      subject: "Подписка Pulsar скоро закончится",
      text,
      html: `<p>${escapeHtml(text)}</p>`,
    })
  if (telegramId) await sendTelegramMessage(telegramId, text)
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!
  )
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
