import assert from "node:assert/strict"
import { readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs"
import { resolve } from "node:path"
import test, { after, before } from "node:test"
import BetterSqlite3 from "better-sqlite3"

const databaseFile = resolve("prisma/test.db")
process.env.APP_ENV = "test"
process.env.APP_URL = "http://localhost:3000"
process.env.DATABASE_URL = `file:${databaseFile.replaceAll("\\", "/")}`
process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters"
process.env.AUTH_PEPPER = "test-auth-pepper-at-least-32-characters"
process.env.DATA_ENCRYPTION_KEY = "11".repeat(32)
process.env.ADMIN_EMAIL = "admin@pulsar.local"
process.env.ADMIN_TELEGRAM_ID = "885112484"
process.env.ADMIN_TELEGRAM_USERNAME = "admin"
process.env.PULSAR_TEST_MODE = "true"
process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "false"
process.env.PAYMENT_PROVIDER = "test"
process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret"
process.env.REMNAWAVE_PROVIDER = "mock"
process.env.TELEGRAM_BOT_USERNAME = "pulsar_test_bot"
process.env.TELEGRAM_WEBHOOK_SECRET = "telegram-test-webhook-secret"

type Modules = Awaited<ReturnType<typeof loadModules>>
let modules: Modules

async function loadModules() {
  const [
    { db, initializeDatabase },
    seeds,
    auth,
    billing,
    users,
    wallet,
    jobs,
    support,
    subscriptions,
    telegramWebhook,
    security,
    browserState,
  ] = await Promise.all([
    import("@/src/server/infrastructure/db/client"),
    import("@/prisma/seed"),
    import("@/src/server/domain/auth/service"),
    import("@/src/server/domain/billing/service"),
    import("@/src/server/domain/users/service"),
    import("@/src/server/domain/wallet/service"),
    import("@/src/jobs/handlers"),
    import("@/src/server/domain/support/service"),
    import("@/src/server/domain/subscriptions/service"),
    import("@/app/api/integrations/telegram/webhook/route"),
    import("@/src/server/infrastructure/security/crypto"),
    import("@/src/server/domain/auth/browser-state"),
  ])
  return {
    db,
    initializeDatabase,
    seeds,
    auth,
    billing,
    users,
    wallet,
    jobs,
    support,
    subscriptions,
    telegramWebhook,
    security,
    browserState,
  }
}

before(async () => {
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(`${databaseFile}${suffix}`, { force: true })
  const sqlite = new BetterSqlite3(databaseFile)
  const migrationSql = readdirSync(resolve("prisma/migrations"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) =>
      readFileSync(
        resolve("prisma/migrations", entry.name, "migration.sql"),
        "utf8"
      )
    )
    .join("\n")
  sqlite.exec("PRAGMA foreign_keys=ON;" + migrationSql)
  sqlite.close()
  modules = await loadModules()
  await modules.initializeDatabase()
  await modules.seeds.seedPricing()
  await modules.seeds.bootstrapAdmin()
})

after(async () => {
  await modules.db.$disconnect()
})

test("admin bootstrap aligns the administrator with the current environment", async () => {
  const identity = await modules.db.authIdentity.findUniqueOrThrow({
    where: { emailNormalized: process.env.ADMIN_EMAIL },
  })
  await modules.db.user.update({
    where: { id: identity.userId },
    data: { isTest: false },
  })

  await modules.seeds.bootstrapAdmin()

  const user = await modules.db.user.findUniqueOrThrow({
    where: { id: identity.userId },
  })
  assert.equal(user.isTest, true)
})

test("email OTP creates one user and challenge is one-time", async () => {
  const requested = await modules.auth.requestEmailChallenge({
    email: "New@Example.com",
  })
  assert.match(requested.devOtp ?? "", /^\d{6}$/)
  const verified = await modules.auth.verifyEmailChallenge({
    challengeId: requested.challengeId,
    otp: requested.devOtp!,
  })
  assert.equal(verified.kind, "USER")
  const identity = await modules.db.authIdentity.findUnique({
    where: { emailNormalized: "new@example.com" },
  })
  assert.equal(identity?.userId, verified.userId)
  const session = await modules.db.session.findFirstOrThrow({
    where: { userId: verified.userId, kind: "USER" },
    orderBy: { createdAt: "desc" },
  })
  const day = 86_400_000
  assert.ok(
    Math.abs(
      session.absoluteExpiresAt.getTime() -
        session.createdAt.getTime() -
        180 * day
    ) < 2_000
  )
  assert.ok(
    Math.abs(
      session.idleExpiresAt.getTime() - session.createdAt.getTime() - 30 * day
    ) < 2_000
  )
  await assert.rejects(
    () =>
      modules.auth.verifyEmailChallenge({
        challengeId: requested.challengeId,
        otp: requested.devOtp!,
      }),
    /already used|использован/i
  )
})

test("OTP attempts and rate-limit counters persist after rejection", async () => {
  const requested = await modules.auth.requestEmailChallenge({
    email: "locked@example.com",
  })
  const wrongOtp = requested.devOtp === "000000" ? "000001" : "000000"
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(() =>
      modules.auth.verifyEmailChallenge({
        challengeId: requested.challengeId,
        otp: wrongOtp,
      })
    )
  }
  const challenge = await modules.db.loginChallenge.findUniqueOrThrow({
    where: { id: requested.challengeId },
  })
  assert.equal(challenge.attempts, 5)
  assert.equal(challenge.status, "LOCKED")
  const limited = await modules.auth.requestEmailChallenge({
    email: "limited@example.com",
  })
  assert.ok(limited.challengeId)
  await assert.rejects(
    () => modules.auth.requestEmailChallenge({ email: "limited@example.com" }),
    /too many|много/i
  )
  const bucket = await modules.db.rateLimitBucket.findFirstOrThrow({
    where: { key: "otp:cooldown:limited@example.com" },
  })
  assert.equal(bucket.count, 2)
})

test("email magic links are browser-bound, one-time, and expire after five minutes", async () => {
  const requested = await modules.auth.requestEmailChallenge({
    email: "magic-link@example.com",
  })
  const challenge = await modules.db.loginChallenge.findUniqueOrThrow({
    where: { id: requested.challengeId },
  })
  const outbox = await modules.db.outboxJob.findFirstOrThrow({
    where: {
      type: "SEND_EMAIL_OTP",
      aggregateId: requested.challengeId,
    },
  })
  const payload = JSON.parse(outbox.payloadJson) as {
    magicLinkTokenEncrypted: string
  }
  const rawToken = modules.security.decryptSensitive(
    payload.magicLinkTokenEncrypted
  )
  assert.notEqual(rawToken, challenge.magicLinkTokenHash)
  assert.equal(
    modules.security.hashToken(rawToken),
    challenge.magicLinkTokenHash
  )
  assert.ok(
    Math.abs(
      challenge.expiresAt.getTime() - challenge.createdAt.getTime() - 300_000
    ) < 2_000
  )

  const wrongState = modules.browserState.createEmailBrowserState(
    "different-challenge"
  )
  await assert.rejects(
    () =>
      modules.auth.consumeEmailMagicLink({
        challengeId: challenge.id,
        rawMagicLinkToken: rawToken,
        browserState: wrongState,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_BROWSER_MISMATCH"
  )
  assert.equal(
    (
      await modules.db.loginChallenge.findUniqueOrThrow({
        where: { id: challenge.id },
      })
    ).status,
    "PENDING"
  )
  assert.equal(
    await modules.db.session.count({
      where: {
        user: {
          identities: { some: { emailNormalized: challenge.emailNormalized } },
        },
      },
    }),
    0
  )

  const browserState = modules.browserState.createEmailBrowserState(
    challenge.id
  )
  const completed = await modules.auth.consumeEmailMagicLink({
    challengeId: challenge.id,
    rawMagicLinkToken: rawToken,
    browserState,
  })
  assert.equal(completed.kind, "USER")
  assert.equal(
    await modules.db.session.count({ where: { userId: completed.userId } }),
    1
  )
  await assert.rejects(
    () =>
      modules.auth.consumeEmailMagicLink({
        challengeId: challenge.id,
        rawMagicLinkToken: rawToken,
        browserState,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_CHALLENGE_USED"
  )

  const expiredRequest = await modules.auth.requestEmailChallenge({
    email: "expired-magic-link@example.com",
  })
  const expiredOutbox = await modules.db.outboxJob.findFirstOrThrow({
    where: {
      type: "SEND_EMAIL_OTP",
      aggregateId: expiredRequest.challengeId,
    },
  })
  const expiredPayload = JSON.parse(expiredOutbox.payloadJson) as {
    magicLinkTokenEncrypted: string
  }
  const expiredRawToken = modules.security.decryptSensitive(
    expiredPayload.magicLinkTokenEncrypted
  )
  await modules.db.loginChallenge.update({
    where: { id: expiredRequest.challengeId },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  })
  await assert.rejects(
    () =>
      modules.auth.consumeEmailMagicLink({
        challengeId: expiredRequest.challengeId,
        rawMagicLinkToken: expiredRawToken,
        browserState: modules.browserState.createEmailBrowserState(
          expiredRequest.challengeId
        ),
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_CHALLENGE_EXPIRED"
  )
  assert.equal(
    (
      await modules.db.loginChallenge.findUniqueOrThrow({
        where: { id: expiredRequest.challengeId },
      })
    ).status,
    "EXPIRED"
  )
})

test("email challenge limits persist at five per email and ten per IP in five minutes", async () => {
  const email = "five-per-window@example.com"
  for (let index = 0; index < 5; index += 1) {
    const requested = await modules.auth.requestEmailChallenge({ email })
    await modules.db.loginChallenge.update({
      where: { id: requested.challengeId },
      data: { createdAt: new Date(Date.now() - 61_000) },
    })
    await modules.db.rateLimitBucket.deleteMany({
      where: { key: `otp:cooldown:${email}` },
    })
  }
  await assert.rejects(
    () => modules.auth.requestEmailChallenge({ email }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_RATE_LIMITED"
  )
  const emailBucket = await modules.db.rateLimitBucket.findFirstOrThrow({
    where: { key: `otp:email:5m:${email}` },
  })
  assert.equal(emailBucket.count, 6)

  const ipHash = "shared-five-minute-ip-hash"
  for (let index = 0; index < 10; index += 1)
    await modules.auth.requestEmailChallenge({
      email: `ip-window-${index}@example.com`,
      ipHash,
    })
  await assert.rejects(
    () =>
      modules.auth.requestEmailChallenge({
        email: "ip-window-rejected@example.com",
        ipHash,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_RATE_LIMITED"
  )
  const ipBucket = await modules.db.rateLimitBucket.findFirstOrThrow({
    where: { key: `otp:ip:5m:${ipHash}` },
  })
  assert.equal(ipBucket.count, 11)
})

test("admin email challenges use the same five-per-five-minute cap", async () => {
  const email = process.env.ADMIN_EMAIL!
  const challengeIds: string[] = []
  for (let index = 0; index < 5; index += 1) {
    const requested = await modules.auth.requestEmailChallenge({
      email,
      purpose: "ADMIN_LOGIN",
    })
    challengeIds.push(requested.challengeId)
    await modules.db.loginChallenge.update({
      where: { id: requested.challengeId },
      data: { createdAt: new Date(Date.now() - 61_000) },
    })
    await modules.db.rateLimitBucket.deleteMany({
      where: { key: `otp:cooldown:${email}` },
    })
  }
  await assert.rejects(
    () =>
      modules.auth.requestEmailChallenge({
        email,
        purpose: "ADMIN_LOGIN",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_RATE_LIMITED"
  )
  assert.equal(
    (
      await modules.db.rateLimitBucket.findFirstOrThrow({
        where: { key: `otp:email:5m:${email}` },
      })
    ).count,
    6
  )
  assert.equal(
    await modules.db.rateLimitBucket.count({
      where: { key: { startsWith: "admin-login:" } },
    }),
    0
  )

  await modules.db.outboxJob.deleteMany({
    where: { aggregateId: { in: challengeIds } },
  })
  await modules.db.loginChallenge.deleteMany({
    where: { id: { in: challengeIds } },
  })
  await modules.db.rateLimitBucket.deleteMany({
    where: {
      key: { in: [`otp:cooldown:${email}`, `otp:email:5m:${email}`] },
    },
  })
})

test("admin sessions use a seven-day idle and 180-day absolute lifetime", async () => {
  const requested = await modules.auth.requestEmailChallenge({
    email: process.env.ADMIN_EMAIL!,
    purpose: "ADMIN_LOGIN",
  })
  const verified = await modules.auth.verifyEmailChallenge({
    challengeId: requested.challengeId,
    otp: requested.devOtp!,
  })
  assert.equal(verified.kind, "ADMIN")
  const session = await modules.db.session.findFirstOrThrow({
    where: { userId: verified.userId, kind: "ADMIN" },
    orderBy: { createdAt: "desc" },
  })
  const day = 86_400_000
  assert.ok(
    Math.abs(
      session.absoluteExpiresAt.getTime() -
        session.createdAt.getTime() -
        180 * day
    ) < 2_000
  )
  assert.ok(
    Math.abs(
      session.idleExpiresAt.getTime() - session.createdAt.getTime() - 7 * day
    ) < 2_000
  )
  await modules.db.loginChallenge.update({
    where: { id: requested.challengeId },
    data: { createdAt: new Date(Date.now() - 61_000) },
  })
  await modules.db.rateLimitBucket.deleteMany({
    where: { key: `otp:cooldown:${process.env.ADMIN_EMAIL!}` },
  })
})

test("referral happy path is idempotent through provisioning", async () => {
  const inviter = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const profile = await modules.db.referralProfile.update({
    where: { userId: inviter.id },
    data: { isEnabled: true, enabledAt: new Date() },
  })
  const requested = await modules.auth.requestEmailChallenge({
    email: "friend@example.com",
    inviteCode: profile.inviteCode,
  })
  const login = await modules.auth.verifyEmailChallenge({
    challengeId: requested.challengeId,
    otp: requested.devOtp!,
  })
  const trial = await modules.db.trialGrant.findUnique({
    where: { userId: login.userId },
  })
  assert.equal(trial?.days, 3)
  const payment = await modules.billing.createCheckout({
    userId: login.userId,
    durationMonths: 1,
    deviceLimit: 1,
    lteEnabled: false,
    idempotencyKey: "happy-payment",
  })
  assert.equal(payment.amountMinor, 11_900)
  const event = {
    eventId: "happy-confirmed",
    eventType: "CONFIRMED",
    externalPaymentId: payment.externalPaymentId!,
    status: "CONFIRMED" as const,
    amountMinor: payment.amountMinor,
    currency: "RUB",
    payload: { id: payment.externalPaymentId, status: "CONFIRMED" },
  }
  await modules.billing.applyPaymentEvent(event)
  await modules.billing.applyPaymentEvent(event)
  assert.equal(
    await modules.db.subscriptionEvent.count({
      where: { paymentId: payment.id },
    }),
    1
  )
  const reward = await modules.db.referralReward.findUnique({
    where: { paymentId: payment.id },
  })
  assert.equal(reward?.amountMinor, 7_500)
  assert.equal(
    (
      await modules.db.walletAccount.findUniqueOrThrow({
        where: { userId: inviter.id },
      })
    ).availableMinor,
    7_500
  )
  const job = await modules.db.outboxJob.findFirstOrThrow({
    where: {
      type: "PROVISION_SUBSCRIPTION",
      aggregateId: (
        await modules.db.subscription.findUniqueOrThrow({
          where: { userId: login.userId },
        })
      ).id,
    },
    orderBy: { createdAt: "desc" },
  })
  await modules.jobs.handleJob({ ...job, attempts: 1 })
  const subscription = await modules.db.subscription.findUniqueOrThrow({
    where: { userId: login.userId },
  })
  assert.equal(subscription.syncStatus, "SYNCED")
  assert.match(subscription.subscriptionUrl ?? "", /\/test\/sub\//)
  await modules.billing.applyPaymentEvent({
    ...event,
    eventId: "late-canceled",
    eventType: "CANCELED",
    status: "CANCELED",
  })
  assert.equal(
    (await modules.db.payment.findUniqueOrThrow({ where: { id: payment.id } }))
      .status,
    "CONFIRMED"
  )
  assert.equal(
    await modules.db.subscriptionEvent.count({
      where: { paymentId: payment.id },
    }),
    1
  )
  const secondUser = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  await assert.rejects(
    () =>
      modules.billing.createCheckout({
        userId: secondUser.id,
        durationMonths: 1,
        deviceLimit: 1,
        lteEnabled: false,
        idempotencyKey: "happy-payment",
      }),
    /different order|conflict/i
  )
})

test("wallet payout reserve, reject and paid preserve ledger projection", async () => {
  const inviter = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  await modules.db.$transaction(async (tx) => {
    const account = await tx.walletAccount.update({
      where: { userId: inviter.id },
      data: {
        availableMinor: { increment: 15_000 },
        version: { increment: 1 },
      },
    })
    await tx.walletLedgerEntry.create({
      data: {
        walletAccountId: account.id,
        userId: inviter.id,
        type: "ADMIN_ADJUSTMENT",
        deltaAvailableMinor: 15_000,
        deltaReservedMinor: 0,
        referenceType: "Test",
        referenceId: "wallet-test",
        idempotencyKey: "wallet-test-adjust",
      },
    })
  })
  const admin = await modules.db.user.findFirstOrThrow({
    where: { role: "ADMIN" },
  })
  const first = await modules.wallet.createPayout({
    userId: inviter.id,
    amountMinor: 15_000,
    details: "Test Bank 1234567890",
    idempotencyKey: "payout-one",
  })
  await modules.wallet.transitionPayout({
    payoutId: first.id,
    adminUserId: admin.id,
    action: "REJECT",
    reason: "test",
    correlationId: "test-reject",
  })
  const second = await modules.wallet.createPayout({
    userId: inviter.id,
    amountMinor: 15_000,
    details: "Test Bank 1234567890",
    idempotencyKey: "payout-two",
  })
  await modules.wallet.transitionPayout({
    payoutId: second.id,
    adminUserId: admin.id,
    action: "APPROVE",
    correlationId: "test-approve",
  })
  await modules.wallet.transitionPayout({
    payoutId: second.id,
    adminUserId: admin.id,
    action: "PAID",
    correlationId: "test-paid",
  })
  const account = await modules.db.walletAccount.findUniqueOrThrow({
    where: { userId: inviter.id },
  })
  const projection = await modules.db.walletLedgerEntry.aggregate({
    where: { userId: inviter.id },
    _sum: { deltaAvailableMinor: true, deltaReservedMinor: true },
  })
  assert.equal(account.availableMinor, projection._sum.deltaAvailableMinor)
  assert.equal(account.reservedMinor, projection._sum.deltaReservedMinor)
  assert.equal(account.reservedMinor, 0)
})

test("Telegram webhook persists only a start-token hash", async () => {
  const challenge = await modules.auth.requestTelegramChallenge({})
  const token = new URL(challenge.url).searchParams.get("start")!
  const challengeRecord = await modules.db.loginChallenge.findUniqueOrThrow({
    where: { id: challenge.challengeId },
  })
  const response = await modules.telegramWebhook.POST(
    new Request("http://localhost/api/integrations/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET!,
      },
      body: JSON.stringify({
        update_id: 123456,
        message: {
          text: `/start ${token}`,
          chat: { id: 900000002, type: "private" },
          from: { id: 900000002, username: "webhook_tester" },
        },
      }),
    })
  )
  assert.equal(response.status, 200)
  const log = await modules.db.telegramUpdateLog.findUniqueOrThrow({
    where: { updateId: "123456" },
  })
  assert.equal(log.payloadJson.includes(token), false)
  const stored = JSON.parse(log.payloadJson) as {
    message?: { command?: string; startTokenHash?: string }
  }
  assert.equal(stored.message?.command, "start")
  assert.equal(
    stored.message?.startTokenHash,
    challengeRecord.telegramStartTokenHash
  )
  await modules.jobs.handleJob({
    id: "private-login-job",
    type: "PROCESS_TELEGRAM_UPDATE",
    payloadJson: JSON.stringify({ updateId: log.updateId }),
    attempts: 1,
    aggregateId: log.updateId,
  })
  assert.equal(
    (
      await modules.db.loginChallenge.findUniqueOrThrow({
        where: { id: challenge.challengeId },
      })
    ).status,
    "COMPLETED"
  )
})

test("Telegram login creates identity and completion session once", async () => {
  const challenge = await modules.auth.requestTelegramChallenge({})
  const token = new URL(challenge.url).searchParams.get("start")!
  const completed = await modules.auth.completeTelegramStart({
    rawStartToken: token,
    telegramId: "900000001",
    username: "tester",
    chatId: "900000001",
  })
  assert.ok(completed.completionToken)
  const { createTelegramBrowserState } =
    await import("@/src/server/domain/auth/browser-state")
  const browserState = createTelegramBrowserState(challenge.challengeId)
  await assert.rejects(
    () =>
      modules.auth.consumeTelegramCompletion({
        rawCompletionToken: completed.completionToken!,
        challengeId: "wrong-challenge",
        browserState,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_BROWSER_MISMATCH"
  )
  await assert.rejects(
    () =>
      modules.auth.consumeTelegramCompletion({
        rawCompletionToken: completed.completionToken!,
        challengeId: challenge.challengeId,
        browserState: "",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_BROWSER_MISMATCH"
  )
  const session = await modules.auth.consumeTelegramCompletion({
    rawCompletionToken: completed.completionToken!,
    challengeId: challenge.challengeId,
    browserState,
  })
  assert.equal(session.kind, "USER")
  assert.equal(
    (
      await modules.db.authIdentity.findUnique({
        where: { telegramId: "900000001" },
      })
    )?.userId,
    session.userId
  )
  assert.equal(
    await modules.db.outboxJob.count({
      where: {
        type: "SEND_TELEGRAM_LOGIN_COMPLETION",
        aggregateId: challenge.challengeId,
      },
    }),
    1
  )
  await assert.rejects(() =>
    modules.auth.consumeTelegramCompletion({
      rawCompletionToken: completed.completionToken!,
      challengeId: challenge.challengeId,
      browserState,
    })
  )
})

test("production test-mode guard refuses unsafe startup", async () => {
  const config = await import("@/src/server/config")
  config.resetConfigForTests()
  process.env.APP_ENV = "production"
  process.env.PULSAR_TEST_MODE = "true"
  process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "false"
  assert.throws(() => config.getConfig(), /cannot run in production/i)
  process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "true"
  process.env.DATABASE_URL = "file:/var/lib/pulsar/production.db"
  config.resetConfigForTests()
  assert.throws(() => config.getConfig(), /canonical local SQLite test/i)
  for (const databaseUrl of [
    "file:./prisma/latest.db",
    "file://remote-host/share/test.db",
    "file:./prisma/test.db?mode=ro",
  ]) {
    process.env.DATABASE_URL = databaseUrl
    config.resetConfigForTests()
    assert.throws(() => config.getConfig(), /canonical local SQLite test/i)
  }
  for (const databaseUrl of [
    "file:./prisma/test.db",
    "file:./prisma/pulsar.test.db",
    "file:./prisma/test-isolated.db",
    "file:./prisma/pulsar-test.db",
  ]) {
    process.env.DATABASE_URL = databaseUrl
    config.resetConfigForTests()
    assert.doesNotThrow(() => config.getConfig())
  }
  process.env.APP_ENV = "test"
  process.env.PULSAR_TEST_MODE = "true"
  process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "false"
  process.env.DATABASE_URL = `file:${databaseFile.replaceAll("\\", "/")}`
  config.resetConfigForTests()
  config.getConfig()
})

test("NODE_ENV production requires APP_ENV production at runtime", async () => {
  const config = await import("@/src/server/config")
  const previousNodeEnv = process.env.NODE_ENV
  const previousNextPhase = process.env.NEXT_PHASE
  try {
    Reflect.set(process.env, "NODE_ENV", "production")
    delete process.env.NEXT_PHASE
    process.env.APP_ENV = "test"
    config.resetConfigForTests()
    assert.throws(() => config.getConfig(), /APP_ENV=production is required/i)

    process.env.NEXT_PHASE = "phase-production-build"
    config.resetConfigForTests()
    assert.doesNotThrow(() => config.getConfig())
  } finally {
    if (previousNodeEnv === undefined)
      Reflect.deleteProperty(process.env, "NODE_ENV")
    else Reflect.set(process.env, "NODE_ENV", previousNodeEnv)
    if (previousNextPhase === undefined) delete process.env.NEXT_PHASE
    else process.env.NEXT_PHASE = previousNextPhase
    process.env.APP_ENV = "test"
    config.resetConfigForTests()
    config.getConfig()
  }
})

test("production test override rejects a database symlink", async (context) => {
  const config = await import("@/src/server/config")
  const linkPath = resolve("prisma/test-symlink.db")
  rmSync(linkPath, { force: true })
  try {
    try {
      symlinkSync(databaseFile, linkPath, "file")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        context.skip("File symlinks require Windows Developer Mode")
        return
      }
      throw error
    }
    process.env.APP_ENV = "production"
    process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "true"
    process.env.DATABASE_URL = `file:${linkPath.replaceAll("\\", "/")}`
    config.resetConfigForTests()
    assert.throws(() => config.getConfig(), /canonical local SQLite test/i)
  } finally {
    rmSync(linkPath, { force: true })
    process.env.APP_ENV = "test"
    process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "false"
    process.env.DATABASE_URL = `file:${databaseFile.replaceAll("\\", "/")}`
    config.resetConfigForTests()
    config.getConfig()
  }
})

test("renewal stages changed plan parameters until the next period", async () => {
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const initial = await modules.billing.createCheckout({
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 1,
    lteEnabled: false,
    idempotencyKey: "renewal-initial",
  })
  await modules.billing.applyPaymentEvent({
    eventId: "renewal-initial-confirmed",
    eventType: "CONFIRMED",
    externalPaymentId: initial.externalPaymentId!,
    status: "CONFIRMED",
    amountMinor: initial.amountMinor,
    currency: initial.currency,
    payload: { id: initial.externalPaymentId, status: "CONFIRMED" },
  })
  const firstPeriod = await modules.db.subscription.findUniqueOrThrow({
    where: { userId: user.id },
  })
  const renewal = await modules.billing.createCheckout({
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 2,
    lteEnabled: true,
    idempotencyKey: "renewal-staged",
  })
  await modules.billing.applyPaymentEvent({
    eventId: "renewal-staged-confirmed",
    eventType: "CONFIRMED",
    externalPaymentId: renewal.externalPaymentId!,
    status: "CONFIRMED",
    amountMinor: renewal.amountMinor,
    currency: renewal.currency,
    payload: { id: renewal.externalPaymentId, status: "CONFIRMED" },
  })
  const staged = await modules.db.subscription.findUniqueOrThrow({
    where: { userId: user.id },
  })
  assert.equal(staged.deviceLimit, 1)
  assert.equal(staged.lteEnabled, false)
  assert.equal(staged.nextDeviceLimit, 2)
  assert.equal(staged.nextLteEnabled, true)
  assert.equal(
    staged.nextParametersAt?.getTime(),
    firstPeriod.expiresAt.getTime()
  )
  assert.equal(
    staged.expiresAt.getTime(),
    firstPeriod.expiresAt.getTime() + 30 * 86_400_000
  )

  await modules.db.subscription.update({
    where: { id: staged.id },
    data: { nextParametersAt: new Date(Date.now() - 1_000) },
  })
  await modules.jobs.handleJob({
    id: "test-reconcile-subscriptions",
    type: "RECONCILE_SUBSCRIPTIONS",
    payloadJson: "{}",
    attempts: 1,
    aggregateId: "subscriptions",
  })
  const applied = await modules.db.subscription.findUniqueOrThrow({
    where: { id: staged.id },
  })
  assert.equal(applied.deviceLimit, 2)
  assert.equal(applied.lteEnabled, true)
  assert.equal(applied.nextDeviceLimit, null)
  assert.equal(applied.nextLteEnabled, null)
  assert.equal(applied.nextParametersAt, null)
  assert.equal(
    await modules.db.subscriptionEvent.count({
      where: {
        subscriptionId: staged.id,
        type: "SCHEDULED_PARAMETERS_APPLIED",
      },
    }),
    1
  )
})

test("pending payments get bounded idempotent reconciliation jobs", async () => {
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const payment = await modules.billing.createCheckout({
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 1,
    lteEnabled: false,
    idempotencyKey: "pending-reconciliation",
  })
  const first = await modules.db.outboxJob.findUniqueOrThrow({
    where: { dedupeKey: `payment:${payment.id}:reconcile:1` },
  })
  await modules.jobs.handleJob({ ...first, attempts: 1 })
  await modules.jobs.handleJob({ ...first, attempts: 1 })
  const next = await modules.db.outboxJob.findUniqueOrThrow({
    where: { dedupeKey: `payment:${payment.id}:reconcile:2` },
  })
  assert.equal(next.type, "RECONCILE_PAYMENT")
  assert.ok(next.runAfter > first.runAfter)
  assert.equal(
    await modules.db.outboxJob.count({
      where: { dedupeKey: `payment:${payment.id}:reconcile:2` },
    }),
    1
  )
})

test("test adapters cannot mutate real-user billing, referrals or payouts", async () => {
  const realUser = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: false })
  )
  await assert.rejects(
    () =>
      modules.billing.createCheckout({
        userId: realUser.id,
        durationMonths: 1,
        deviceLimit: 1,
        lteEnabled: false,
        idempotencyKey: "cross-mode-payment",
      }),
    /forbidden|войдите/i
  )
  await assert.rejects(
    () =>
      modules.wallet.createPayout({
        userId: realUser.id,
        amountMinor: 15_000,
        details: "Real Bank 1234567890",
        idempotencyKey: "cross-mode-payout",
      }),
    /forbidden|войдите/i
  )
  const profile = await modules.db.referralProfile.update({
    where: { userId: realUser.id },
    data: { isEnabled: true, enabledAt: new Date() },
  })
  const requested = await modules.auth.requestEmailChallenge({
    email: "cross-mode-referral@example.com",
    inviteCode: profile.inviteCode,
  })
  await assert.rejects(() =>
    modules.auth.verifyEmailChallenge({
      challengeId: requested.challengeId,
      otp: requested.devOtp!,
    })
  )
  assert.equal(
    await modules.db.authIdentity.count({
      where: { emailNormalized: "cross-mode-referral@example.com" },
    }),
    0
  )
})

test("test mode requires only test and mock adapters", async () => {
  const config = await import("@/src/server/config")
  config.resetConfigForTests()
  process.env.APP_ENV = "test"
  process.env.PULSAR_TEST_MODE = "true"
  process.env.PAYMENT_PROVIDER = "platega"
  process.env.REMNAWAVE_PROVIDER = "mock"
  assert.throws(() => config.getConfig(), /requires PAYMENT_PROVIDER=test/i)
  config.resetConfigForTests()
  process.env.PAYMENT_PROVIDER = "test"
  process.env.REMNAWAVE_PROVIDER = "http"
  assert.throws(() => config.getConfig(), /requires REMNAWAVE_PROVIDER=mock/i)
  process.env.REMNAWAVE_PROVIDER = "mock"
  config.resetConfigForTests()
  config.getConfig()
})

test("invalid payout transitions are rejected before mutation", async () => {
  const admin = await modules.db.user.findFirstOrThrow({
    where: { role: "ADMIN" },
  })
  await assert.rejects(() =>
    modules.wallet.transitionPayout({
      payoutId: "not-used",
      adminUserId: admin.id,
      action: "INVALID" as "APPROVE",
      correlationId: "invalid-action",
    })
  )
})

test("database permits only one open checkout per user", async () => {
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const first = await modules.billing.createCheckout({
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 1,
    lteEnabled: false,
    idempotencyKey: "single-open-first",
  })
  await assert.rejects(
    () =>
      modules.billing.createCheckout({
        userId: user.id,
        durationMonths: 1,
        deviceLimit: 2,
        lteEnabled: false,
        idempotencyKey: "single-open-second",
      }),
    /pending|checkout|conflict/i
  )
  await assert.rejects(() =>
    modules.db.payment.create({
      data: {
        userId: user.id,
        provider: "test",
        externalPaymentId: "test_second_open",
        idempotencyKey: "single-open-db-guard",
        status: "PENDING",
        amountMinor: first.amountMinor,
        currency: first.currency,
        durationDays: first.durationDays,
        deviceLimit: first.deviceLimit,
        lteEnabled: first.lteEnabled,
        basePriceMinor: first.basePriceMinor,
        extraDevicesPriceMinor: first.extraDevicesPriceMinor,
        ltePriceMinor: first.ltePriceMinor,
        discountMinor: first.discountMinor,
        priceSnapshotJson: first.priceSnapshotJson,
        pricingVersion: first.pricingVersion,
        isTest: true,
      },
    })
  )
})

test("expired pending checkout no longer blocks a replacement", async () => {
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const expired = await modules.billing.createCheckout({
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 1,
    lteEnabled: false,
    idempotencyKey: "expired-open-first",
  })
  await modules.db.payment.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  })
  const replacement = await modules.billing.createCheckout({
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 2,
    lteEnabled: false,
    idempotencyKey: "expired-open-replacement",
  })
  assert.equal(
    (await modules.db.payment.findUniqueOrThrow({ where: { id: expired.id } }))
      .status,
    "EXPIRED"
  )
  assert.equal(replacement.status, "PENDING")

  await modules.billing.applyPaymentEvent({
    eventId: "expired-open-stale-pending",
    eventType: "PENDING",
    externalPaymentId: expired.externalPaymentId!,
    status: "PENDING",
    amountMinor: expired.amountMinor,
    currency: expired.currency,
    payload: { id: expired.externalPaymentId, status: "PENDING" },
  })
  assert.equal(
    (await modules.db.payment.findUniqueOrThrow({ where: { id: expired.id } }))
      .status,
    "EXPIRED"
  )
})

test("readiness requires every exact migration to be complete", async () => {
  const { EXPECTED_MIGRATIONS, evaluateMigrationReadiness } =
    await import("@/src/server/infrastructure/db/migrations")
  const completed = EXPECTED_MIGRATIONS.map((migrationName) => ({
    migrationName,
    finishedAt: new Date(),
    rolledBackAt: null,
  }))
  assert.equal(evaluateMigrationReadiness(completed).ready, true)
  assert.equal(evaluateMigrationReadiness(completed.slice(1)).ready, false)
  assert.equal(
    evaluateMigrationReadiness([
      ...completed.slice(0, 1),
      { ...completed[1], finishedAt: null },
    ]).ready,
    false
  )
  assert.equal(
    evaluateMigrationReadiness([
      ...completed.slice(0, 1),
      { ...completed[1], rolledBackAt: new Date() },
    ]).ready,
    false
  )
})

test("verified conflicting renewal is confirmed and queued for review", async () => {
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const initial = await modules.billing.createCheckout({
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 1,
    lteEnabled: false,
    idempotencyKey: "review-initial",
  })
  await modules.billing.applyPaymentEvent({
    eventId: "review-initial-confirmed",
    eventType: "CONFIRMED",
    externalPaymentId: initial.externalPaymentId!,
    status: "CONFIRMED",
    amountMinor: initial.amountMinor,
    currency: initial.currency,
    payload: { payload: initial.id },
  })
  const renewal = await modules.billing.createCheckout({
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 2,
    lteEnabled: false,
    idempotencyKey: "review-renewal",
  })
  await modules.billing.applyPaymentEvent({
    eventId: "review-renewal-confirmed",
    eventType: "CONFIRMED",
    externalPaymentId: renewal.externalPaymentId!,
    status: "CONFIRMED",
    amountMinor: renewal.amountMinor,
    currency: renewal.currency,
    payload: { payload: renewal.id },
  })
  const conflicting = await modules.db.payment.create({
    data: {
      userId: user.id,
      provider: "test",
      externalPaymentId: "test_conflicting_paid",
      idempotencyKey: "review-conflicting",
      status: "PENDING",
      amountMinor: renewal.amountMinor,
      currency: renewal.currency,
      durationDays: renewal.durationDays,
      deviceLimit: 3,
      lteEnabled: true,
      basePriceMinor: renewal.basePriceMinor,
      extraDevicesPriceMinor: renewal.extraDevicesPriceMinor,
      ltePriceMinor: renewal.ltePriceMinor,
      discountMinor: renewal.discountMinor,
      priceSnapshotJson: renewal.priceSnapshotJson,
      pricingVersion: renewal.pricingVersion,
      isTest: true,
    },
  })
  await modules.billing.applyPaymentEvent({
    eventId: "review-conflicting-confirmed",
    eventType: "CONFIRMED",
    externalPaymentId: conflicting.externalPaymentId!,
    status: "CONFIRMED",
    amountMinor: conflicting.amountMinor,
    currency: conflicting.currency,
    payload: { payload: conflicting.id },
  })
  assert.equal(
    (
      await modules.db.payment.findUniqueOrThrow({
        where: { id: conflicting.id },
      })
    ).status,
    "CONFIRMED"
  )
  assert.equal(
    await modules.db.subscriptionEvent.count({
      where: {
        paymentId: conflicting.id,
        type: "PAYMENT_FULFILLMENT_REVIEW_REQUIRED",
      },
    }),
    1
  )
  const subscription = await modules.db.subscription.findUniqueOrThrow({
    where: { userId: user.id },
  })
  assert.equal(subscription.nextDeviceLimit, 2)
})

test("test login cannot consume a real user's identity", async () => {
  const realUser = await modules.db.$transaction(async (tx) => {
    const user = await modules.users.createUserGraph(tx, { isTest: false })
    await tx.authIdentity.create({
      data: {
        userId: user.id,
        provider: "EMAIL",
        providerSubject: "real-login@example.com",
        emailNormalized: "real-login@example.com",
        verifiedAt: new Date(),
      },
    })
    return user
  })
  const challenge = await modules.auth.requestEmailChallenge({
    email: "real-login@example.com",
  })
  await assert.rejects(() =>
    modules.auth.verifyEmailChallenge({
      challengeId: challenge.challengeId,
      otp: challenge.devOtp!,
    })
  )
  assert.equal(
    await modules.db.session.count({ where: { userId: realUser.id } }),
    0
  )
})

test("admin OTP failures are audited", async () => {
  const challenge = await modules.auth.requestEmailChallenge({
    email: process.env.ADMIN_EMAIL!,
    purpose: "ADMIN_LOGIN",
  })
  const wrongOtp = challenge.devOtp === "111111" ? "222222" : "111111"
  await assert.rejects(() =>
    modules.auth.verifyEmailChallenge({
      challengeId: challenge.challengeId,
      otp: wrongOtp,
    })
  )
  assert.equal(
    await modules.db.auditLog.count({
      where: {
        action: "ADMIN_LOGIN_INVALID_OTP",
        entityId: challenge.challengeId,
      },
    }),
    1
  )
})

test("Telegram auth updates from group chats are ignored", async () => {
  const challenge = await modules.auth.requestTelegramChallenge({})
  const startTokenHash = (
    await modules.db.loginChallenge.findUniqueOrThrow({
      where: { id: challenge.challengeId },
    })
  ).telegramStartTokenHash!
  const log = await modules.db.telegramUpdateLog.create({
    data: {
      updateId: "group-login-update",
      updateType: "message",
      payloadJson: JSON.stringify({
        message: {
          command: "start",
          startTokenHash,
          chat: { id: "-100123", type: "supergroup" },
          from: { id: "900000777", username: "group_user" },
        },
      }),
    },
  })
  await modules.jobs.handleJob({
    id: "group-login-job",
    type: "PROCESS_TELEGRAM_UPDATE",
    payloadJson: JSON.stringify({ updateId: log.updateId }),
    attempts: 1,
    aggregateId: log.updateId,
  })
  assert.ok(
    (
      await modules.db.telegramUpdateLog.findUniqueOrThrow({
        where: { id: log.id },
      })
    ).processedAt
  )
  assert.equal(
    (
      await modules.db.loginChallenge.findUniqueOrThrow({
        where: { id: challenge.challengeId },
      })
    ).status,
    "PENDING"
  )
})

test("support messages are rate-limited with persisted counters", async () => {
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  for (let index = 0; index < 5; index += 1)
    await modules.support.sendSupportMessage({
      userId: user.id,
      body: `Support message ${index}`,
    })
  await assert.rejects(
    () =>
      modules.support.sendSupportMessage({
        userId: user.id,
        body: "Support message blocked",
      }),
    /too many|много/i
  )
  const bucket = await modules.db.rateLimitBucket.findFirstOrThrow({
    where: { key: `support:${user.id}:minute` },
  })
  assert.equal(bucket.count, 6)
})

test("subscription URL regeneration is bounded and stale jobs are no-ops", async () => {
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const subscription = await modules.db.subscription.create({
    data: {
      userId: user.id,
      status: "ACTIVE",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      deviceLimit: 1,
      remnawaveUserId: `remote-regenerate-${user.id}`,
      subscriptionUrl: `https://example.test/sub/${user.id}`,
      syncStatus: "SYNCED",
      syncVersion: 1,
    },
  })

  const queued = await modules.subscriptions.requestSubscriptionUrlRegeneration(
    user.id,
    new Date("2026-07-13T00:00:00.000Z")
  )
  await assert.rejects(
    () =>
      modules.subscriptions.requestSubscriptionUrlRegeneration(
        user.id,
        new Date("2026-07-13T00:00:01.000Z")
      ),
    (error: unknown) =>
      (error as { code?: string; status?: number }).code ===
        "AUTH_RATE_LIMITED" && (error as { status?: number }).status === 429
  )
  assert.equal(
    await modules.db.outboxJob.count({
      where: {
        type: "REGENERATE_SUBSCRIPTION_URL",
        aggregateId: subscription.id,
      },
    }),
    1
  )

  await modules.db.subscription.update({
    where: { id: subscription.id },
    data: { syncVersion: { increment: 1 } },
  })
  await assert.doesNotReject(() =>
    modules.jobs.handleJob({
      id: queued.jobId,
      type: "REGENERATE_SUBSCRIPTION_URL",
      payloadJson: JSON.stringify({
        subscriptionId: subscription.id,
        syncVersion: queued.syncVersion,
      }),
      attempts: 1,
      aggregateId: subscription.id,
    })
  )
})

test("cookie-authenticated mutations require exact same origin", async () => {
  const { requireSameOrigin } =
    await import("@/src/server/transport/http/security")
  assert.throws(() =>
    requireSameOrigin(
      new Request("http://localhost:3000/api/wallet/payouts", {
        method: "POST",
        headers: {
          Origin: "https://panel.pulsar-cloud.space",
          "Content-Type": "text/plain",
          "Sec-Fetch-Site": "same-site",
        },
        body: "{}",
      })
    )
  )
  assert.doesNotThrow(() =>
    requireSameOrigin(
      new Request("http://localhost:3000/api/wallet/payouts", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
          "Sec-Fetch-Site": "same-origin",
        },
        body: "{}",
      })
    )
  )
})
