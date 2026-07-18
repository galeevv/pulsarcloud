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
process.env.PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE = "false"
process.env.PAYMENT_PROVIDER = "test"
process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret"
process.env.REMNAWAVE_PROVIDER = "mock"
process.env.RESEND_API_KEY = "re_test_pulsar_auth"
process.env.RESEND_FROM_EMAIL = "Pulsar <auth@example.test>"
process.env.TELEGRAM_BOT_TOKEN = "123456789:test-pulsar-bot-token"
process.env.TELEGRAM_BOT_USERNAME = "pulsar_test_bot"
process.env.TELEGRAM_WEBHOOK_SECRET = "telegram-test-webhook-secret"

type Modules = Awaited<ReturnType<typeof loadModules>>
let modules: Modules

function telegramStartToken(url: string) {
  const parsed = new URL(url)
  return (
    parsed.searchParams.get("token") ?? parsed.searchParams.get("start") ?? ""
  )
}

function telegramWebhookRequest(
  update: Record<string, unknown>,
  secret = process.env.TELEGRAM_WEBHOOK_SECRET!
) {
  return new Request("http://localhost/api/integrations/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify(update),
  })
}

async function processTelegramUpdate(updateId: string) {
  await modules.jobs.handleJob({
    id: `telegram-job-${updateId}`,
    type: "PROCESS_TELEGRAM_UPDATE",
    payloadJson: JSON.stringify({ updateId }),
    attempts: 1,
    aggregateId: updateId,
  })
}

async function loadModules() {
  const [
    { db, initializeDatabase, withBusyRetry },
    seeds,
    auth,
    billing,
    users,
    wallet,
    jobs,
    support,
    subscriptions,
    telegramWebhook,
    telegramGateway,
    security,
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
    import("@/src/server/infrastructure/telegram/gateway"),
    import("@/src/server/infrastructure/security/crypto"),
  ])
  const createCheckout = async (
    input: Omit<
      Parameters<typeof billing.createCheckout>[0],
      "expectedAmountMinor" | "pricingVersion"
    >
  ) =>
    billing.createCheckout({
      ...input,
      ...(await billing.getCheckoutExpectation(input)),
    })
  return {
    db,
    initializeDatabase,
    withBusyRetry,
    seeds,
    auth,
    billing: {
      ...billing,
      createCheckout,
      rawCreateCheckout: billing.createCheckout,
    },
    users,
    wallet,
    jobs,
    support,
    subscriptions,
    telegramWebhook,
    telegramGateway,
    security,
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

test("SQLite adapter busy timeouts are retried without retrying generic timeouts", async () => {
  const sqliteBusyTimeout = Object.assign(
    new Error("Operation has timed out"),
    {
      code: "P1008",
      meta: {
        driverAdapterError: Object.assign(new Error("Driver adapter error"), {
          name: "DriverAdapterError",
          cause: {
            kind: "SocketTimeout",
            originalCode: "SQLITE_BUSY",
            originalMessage: "database is locked",
          },
        }),
      },
    }
  )
  let busyAttempts = 0
  const result = await modules.withBusyRetry(async () => {
    busyAttempts += 1
    if (busyAttempts === 1) throw sqliteBusyTimeout
    return "ok"
  })
  assert.equal(result, "ok")
  assert.equal(busyAttempts, 2)

  const genericTimeout = Object.assign(new Error("Operation has timed out"), {
    code: "P1008",
    meta: {
      driverAdapterError: Object.assign(new Error("Driver adapter error"), {
        name: "DriverAdapterError",
        cause: {
          kind: "SocketTimeout",
          originalCode: "ETIMEDOUT",
          originalMessage: "socket timed out",
        },
      }),
    },
  })
  let genericAttempts = 0
  await assert.rejects(
    () =>
      modules.withBusyRetry(async () => {
        genericAttempts += 1
        throw genericTimeout
      }),
    (error) => error === genericTimeout
  )
  assert.equal(genericAttempts, 1)
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

test("logout permits an immediate new email challenge after completed login", async () => {
  const email = "immediate-relogin@example.com"
  const first = await modules.auth.requestEmailChallenge({ email })
  const login = await modules.auth.verifyEmailChallenge({
    challengeId: first.challengeId,
    otp: first.devOtp!,
  })
  await modules.db.session.updateMany({
    where: { userId: login.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  const second = await modules.auth.requestEmailChallenge({ email })

  assert.notEqual(second.challengeId, first.challengeId)
  assert.equal(
    await modules.db.loginChallenge.count({
      where: { emailNormalized: email },
    }),
    2
  )
  assert.equal(
    (
      await modules.db.rateLimitBucket.findFirstOrThrow({
        where: { key: `otp:email:5m:${email}` },
      })
    ).count,
    2
  )
})

test("OTP attempts persist while rejected email requests do not burn rate-limit quota", async () => {
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
  assert.equal(
    await modules.db.rateLimitBucket.count({
      where: { key: "otp:cooldown:limited@example.com" },
    }),
    0
  )
  assert.equal(
    await modules.db.loginChallenge.count({
      where: { emailNormalized: "limited@example.com" },
    }),
    1
  )
  assert.equal(
    await modules.db.outboxJob.count({
      where: {
        aggregateType: "LoginChallenge",
        aggregateId: limited.challengeId,
      },
    }),
    1
  )
})

test("email magic links work across browsers, stay one-time, and expire after five minutes", async () => {
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

  await assert.rejects(
    () =>
      modules.auth.consumeEmailMagicLink({
        challengeId: "different-challenge",
        rawMagicLinkToken: rawToken,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_CHALLENGE_EXPIRED"
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

  const completed = await modules.auth.consumeEmailMagicLink({
    challengeId: challenge.id,
    rawMagicLinkToken: rawToken,
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
      data: { status: "COMPLETED" },
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
  assert.equal(emailBucket.count, 5)

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
  assert.equal(ipBucket.count, 10)
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
      data: { status: "COMPLETED" },
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
    5
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
    where: { key: `otp:email:5m:${email}` },
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
  assert.equal(
    (
      await modules.db.subscription.findUniqueOrThrow({
        where: { userId: login.userId },
      })
    ).lteEnabled,
    true
  )
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
  const replayed = await modules.billing.rawCreateCheckout({
    userId: login.userId,
    durationMonths: 1,
    deviceLimit: 1,
    lteEnabled: false,
    expectedAmountMinor: 11_900,
    pricingVersion: 4,
    idempotencyKey: "happy-payment",
  })
  assert.equal(replayed.id, payment.id)
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

test("internal balance atomically pays for and activates a subscription", async () => {
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  await modules.db.$transaction(async (tx) => {
    const wallet = await tx.walletAccount.update({
      where: { userId: user.id },
      data: {
        availableMinor: { increment: 30_000 },
        version: { increment: 1 },
      },
    })
    await tx.walletLedgerEntry.create({
      data: {
        walletAccountId: wallet.id,
        userId: user.id,
        type: "ADMIN_ADJUSTMENT",
        deltaAvailableMinor: 30_000,
        deltaReservedMinor: 0,
        referenceType: "Test",
        referenceId: "wallet-subscription-funding",
        idempotencyKey: "wallet-subscription-funding",
      },
    })
  })

  const payment = await modules.billing.createCheckout({
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 3,
    lteEnabled: true,
    paymentMethod: "WALLET",
    idempotencyKey: "wallet-subscription-payment",
  })
  assert.equal(payment.amountMinor, 19_900)
  assert.equal(payment.provider, "wallet")
  assert.equal(payment.status, "CONFIRMED")
  assert.equal(
    (
      await modules.db.walletAccount.findUniqueOrThrow({
        where: { userId: user.id },
      })
    ).availableMinor,
    10_100
  )
  const ledger = await modules.db.walletLedgerEntry.findUniqueOrThrow({
    where: { idempotencyKey: `wallet-subscription:${payment.id}` },
  })
  assert.equal(ledger.deltaAvailableMinor, -19_900)
  const subscription = await modules.db.subscription.findUniqueOrThrow({
    where: { userId: user.id },
  })
  assert.equal(subscription.deviceLimit, 3)
  assert.equal(subscription.lteEnabled, true)

  const recoveryUser = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  await modules.db.walletAccount.update({
    where: { userId: recoveryUser.id },
    data: { availableMinor: 30_000 },
  })
  const interrupted = await modules.db.payment.create({
    data: {
      userId: recoveryUser.id,
      provider: "wallet",
      externalPaymentId: "wallet_interrupted_checkout",
      idempotencyKey: "wallet-interrupted-original",
      status: "PENDING",
      amountMinor: 19_900,
      currency: "RUB",
      durationDays: 30,
      deviceLimit: 3,
      lteEnabled: true,
      basePriceMinor: 11_900,
      extraDevicesPriceMinor: 3_000,
      ltePriceMinor: 5_000,
      discountMinor: 0,
      priceSnapshotJson: "{}",
      pricingVersion: 4,
      checkoutUrl: "http://localhost:3000/subscription?payment=success",
      providerCreatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      isTest: true,
    },
  })
  await modules.db.pricingSettings.update({
    where: { key: "default" },
    data: { version: 4 },
  })
  const recovered = await modules.billing.rawCreateCheckout({
    userId: recoveryUser.id,
    durationMonths: 1,
    deviceLimit: 3,
    lteEnabled: true,
    paymentMethod: "WALLET",
    expectedAmountMinor: 19_900,
    pricingVersion: 4,
    idempotencyKey: "wallet-interrupted-retry",
  })
  await modules.db.pricingSettings.update({
    where: { key: "default" },
    data: { version: 4 },
  })
  assert.equal(recovered.id, interrupted.id)
  assert.equal(recovered.status, "CONFIRMED")
  assert.equal(
    await modules.db.walletLedgerEntry.count({
      where: { idempotencyKey: `wallet-subscription:${interrupted.id}` },
    }),
    1
  )

  const withoutFunds = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  await assert.rejects(
    () =>
      modules.billing.createCheckout({
        userId: withoutFunds.id,
        durationMonths: 1,
        deviceLimit: 3,
        lteEnabled: true,
        paymentMethod: "WALLET",
        idempotencyKey: "wallet-subscription-insufficient",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WALLET_INSUFFICIENT_BALANCE"
  )
  assert.equal(
    await modules.db.walletLedgerEntry.count({
      where: { userId: withoutFunds.id, type: "SUBSCRIPTION_PAYMENT" },
    }),
    0
  )
})

test("stale checkout amount or pricing version cannot create a payment", async () => {
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const selection = {
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 3,
    lteEnabled: true,
  }
  const expected = await modules.billing.getCheckoutExpectation(selection)

  for (const stale of [
    { ...expected, expectedAmountMinor: expected.expectedAmountMinor - 1 },
    { ...expected, pricingVersion: expected.pricingVersion - 1 },
  ])
    await assert.rejects(
      () =>
        modules.billing.rawCreateCheckout({
          ...selection,
          ...stale,
          idempotencyKey: `stale-price-${stale.expectedAmountMinor}-${stale.pricingVersion}`,
        }),
      (error: unknown) =>
        (error as { code?: string }).code === "PAYMENT_PRICE_CHANGED"
    )

  assert.equal(
    await modules.db.payment.count({ where: { userId: user.id } }),
    0
  )
})

test("admin wallet adjustments are atomic, idempotent, audited and never overdraw", async () => {
  const admin = await modules.db.user.findFirstOrThrow({
    where: { role: "ADMIN" },
  })
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const firstInput = {
    adminUserId: admin.id,
    userId: user.id,
    deltaMinor: 50_000,
    comment: "Компенсация пользователю по обращению",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    correlationId: "wallet-adjustment-test-one",
  }

  const credited = await modules.wallet.adjustWalletBalanceByAdmin(firstInput)
  assert.equal(credited.applied, true)
  assert.equal(credited.availableMinor, 50_000)

  const replayed = await modules.wallet.adjustWalletBalanceByAdmin(firstInput)
  assert.equal(replayed.applied, false)
  assert.equal(replayed.ledgerEntryId, credited.ledgerEntryId)
  assert.equal(replayed.availableMinor, 50_000)
  assert.equal(
    await modules.db.walletLedgerEntry.count({
      where: { userId: user.id, type: "ADMIN_ADJUSTMENT" },
    }),
    1
  )
  assert.equal(
    await modules.db.auditLog.count({
      where: {
        action: "WALLET_ADMIN_ADJUSTED",
        entityId: (
          await modules.db.walletAccount.findUniqueOrThrow({
            where: { userId: user.id },
          })
        ).id,
      },
    }),
    1
  )

  await assert.rejects(
    () =>
      modules.wallet.adjustWalletBalanceByAdmin({
        ...firstInput,
        deltaMinor: 40_000,
      }),
    (error: unknown) => (error as { code?: string }).code === "CONFLICT"
  )

  const debited = await modules.wallet.adjustWalletBalanceByAdmin({
    ...firstInput,
    deltaMinor: -20_000,
    comment: "Корректировка ошибочного начисления",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    correlationId: "wallet-adjustment-test-two",
  })
  assert.equal(debited.applied, true)
  assert.equal(debited.availableMinor, 30_000)

  await assert.rejects(
    () =>
      modules.wallet.adjustWalletBalanceByAdmin({
        ...firstInput,
        deltaMinor: -40_000,
        comment: "Попытка списать больше доступного",
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
        correlationId: "wallet-adjustment-test-three",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WALLET_INSUFFICIENT_BALANCE"
  )
  assert.equal(
    (
      await modules.db.walletAccount.findUniqueOrThrow({
        where: { userId: user.id },
      })
    ).availableMinor,
    30_000
  )
  assert.equal(
    await modules.db.walletLedgerEntry.count({
      where: { userId: user.id, type: "ADMIN_ADJUSTMENT" },
    }),
    2
  )

  await assert.rejects(
    () =>
      modules.wallet.adjustWalletBalanceByAdmin({
        ...firstInput,
        deltaMinor: 150,
        idempotencyKey: "44444444-4444-4444-8444-444444444444",
      }),
    (error: unknown) => (error as { code?: string }).code === "INVALID_INPUT"
  )
  const nonAdmin = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  await assert.rejects(
    () =>
      modules.wallet.adjustWalletBalanceByAdmin({
        ...firstInput,
        adminUserId: nonAdmin.id,
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
      }),
    (error: unknown) => (error as { code?: string }).code === "ADMIN_FORBIDDEN"
  )

  const projection = await modules.db.walletLedgerEntry.aggregate({
    where: { userId: user.id },
    _sum: { deltaAvailableMinor: true },
  })
  assert.equal(projection._sum.deltaAvailableMinor, 30_000)
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

test("test-mode Telegram challenge uses the local simulator without a bot username", async () => {
  const config = await import("@/src/server/config")
  const previousUsername = process.env.TELEGRAM_BOT_USERNAME
  delete process.env.TELEGRAM_BOT_USERNAME
  config.resetConfigForTests()

  try {
    const challenge = await modules.auth.requestTelegramChallenge({})
    const url = new URL(challenge.url)
    const token = telegramStartToken(challenge.url)
    assert.equal(url.origin, process.env.APP_URL)
    assert.equal(url.pathname, `/test/telegram/${challenge.challengeId}`)
    assert.ok(token)
    assert.equal(url.searchParams.get("start"), null)
    const preview = await modules.auth.getPendingTelegramTestChallenge({
      challengeId: challenge.challengeId,
      rawStartToken: token,
    })
    assert.equal(preview.purpose, "USER_LOGIN")
  } finally {
    if (previousUsername === undefined) delete process.env.TELEGRAM_BOT_USERNAME
    else process.env.TELEGRAM_BOT_USERNAME = previousUsername
    config.resetConfigForTests()
  }
})

test("test-mode Telegram simulator binds the token to its challenge", async () => {
  const first = await modules.auth.requestTelegramChallenge({})
  const second = await modules.auth.requestTelegramChallenge({})
  const token = telegramStartToken(first.url)

  await assert.rejects(
    () =>
      modules.auth.completeTelegramStart({
        challengeId: second.challengeId,
        rawStartToken: token,
        telegramId: "900000010",
        username: "mismatched_challenge",
        chatId: "900000010",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_CHALLENGE_EXPIRED"
  )
  assert.equal(
    (
      await modules.db.loginChallenge.findUniqueOrThrow({
        where: { id: first.challengeId },
      })
    ).status,
    "PENDING"
  )
})

test("test-mode Telegram simulator links Telegram to the requesting user", async () => {
  const emailChallenge = await modules.auth.requestEmailChallenge({
    email: "telegram-link@example.com",
  })
  const user = await modules.auth.verifyEmailChallenge({
    challengeId: emailChallenge.challengeId,
    otp: emailChallenge.devOtp!,
  })
  const challenge = await modules.auth.requestTelegramChallenge({
    purpose: "LINK_TELEGRAM",
    requestedByUserId: user.userId,
  })
  const linked = await modules.auth.completeTelegramStart({
    challengeId: challenge.challengeId,
    rawStartToken: telegramStartToken(challenge.url),
    telegramId: "900000011",
    username: "linked_tester",
    chatId: "900000011",
  })

  assert.equal(linked.linked, true)
  assert.equal(linked.userId, user.userId)
  assert.equal(linked.completionToken, null)
  assert.equal(
    (
      await modules.db.authIdentity.findUniqueOrThrow({
        where: { telegramId: "900000011" },
      })
    ).userId,
    user.userId
  )
})

test("plain /start registers a shared user graph and reuses it", async () => {
  modules.telegramGateway.resetTestTelegramGatewayEvents()
  const update = {
    update_id: 220001,
    message: {
      text: "/start",
      chat: { id: 900000201, type: "private" },
      from: {
        id: 900000201,
        username: "menu_user",
        first_name: "Ирина",
        last_name: "Пульсар",
      },
    },
  }
  const first = await modules.telegramWebhook.POST(
    telegramWebhookRequest(update)
  )
  const duplicate = await modules.telegramWebhook.POST(
    telegramWebhookRequest(update)
  )
  assert.equal(first.status, 200)
  assert.equal(duplicate.status, 200)
  assert.equal(
    await modules.db.telegramUpdateLog.count({
      where: { updateId: "220001" },
    }),
    1
  )
  assert.equal(
    await modules.db.outboxJob.count({
      where: { dedupeKey: "telegram-update:220001" },
    }),
    1
  )

  await processTelegramUpdate("220001")
  const identity = await modules.db.authIdentity.findUniqueOrThrow({
    where: { telegramId: "900000201" },
  })
  const user = await modules.db.user.findUniqueOrThrow({
    where: { id: identity.userId },
    include: { wallet: true, referralProfile: true, telegramProfile: true },
  })
  assert.ok(user.wallet)
  assert.ok(user.referralProfile)
  assert.equal(user.telegramProfile?.firstName, "Ирина")
  assert.equal(user.telegramProfile?.newsNotificationsEnabled, true)

  const sent = modules.telegramGateway
    .getTestTelegramGatewayEvents()
    .find((event) => event.type === "sendMessage")
  assert.ok(sent && sent.type === "sendMessage")
  assert.match(sent.text, /Добро пожаловать, Ирина в PULSAR/)
  const markup = JSON.stringify(sent.replyMarkup)
  assert.match(markup, /menu:subscription/)
  assert.match(markup, /menu:balance/)
  assert.match(markup, /menu:referrals/)
  assert.match(markup, /menu:support/)
  assert.match(markup, /http:\/\/localhost:3000\/home/)
  assert.doesNotMatch(markup, /web_app/)

  const userCount = await modules.db.user.count()
  await modules.telegramWebhook.POST(
    telegramWebhookRequest({
      ...update,
      update_id: 220002,
      message: { ...update.message, text: "/help" },
    })
  )
  await processTelegramUpdate("220002")
  assert.equal(await modules.db.user.count(), userCount)
  assert.equal(
    (
      await modules.db.authIdentity.findUniqueOrThrow({
        where: { telegramId: "900000201" },
      })
    ).userId,
    identity.userId
  )
})

test("Telegram menu callbacks read subscription, wallet, and referrals from the shared database", async () => {
  const identity = await modules.db.authIdentity.findUniqueOrThrow({
    where: { telegramId: "900000201" },
  })
  await modules.db.walletAccount.update({
    where: { userId: identity.userId },
    data: { availableMinor: 12_345 },
  })
  await modules.db.referralProfile.update({
    where: { userId: identity.userId },
    data: { isEnabled: true, enabledAt: new Date() },
  })
  await modules.db.subscription.create({
    data: {
      userId: identity.userId,
      status: "ACTIVE",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 86_400_000),
      deviceLimit: 4,
      lteEnabled: true,
      subscriptionUrl: "https://sub.pulsar-cloud.space/test-user",
      syncStatus: "SYNCED",
      syncVersion: 1,
    },
  })

  const callbacks = [
    [220003, "callback-subscription", "menu:subscription"],
    [220004, "callback-balance", "menu:balance"],
    [220005, "callback-referrals", "menu:referrals"],
  ] as const
  for (const [updateId, callbackId, data] of callbacks) {
    modules.telegramGateway.resetTestTelegramGatewayEvents()
    const response = await modules.telegramWebhook.POST(
      telegramWebhookRequest({
        update_id: updateId,
        callback_query: {
          id: callbackId,
          from: { id: 900000201 },
          message: {
            message_id: 77,
            chat: { id: 900000201, type: "private" },
          },
          data,
        },
      })
    )
    assert.equal(response.status, 200)
    await processTelegramUpdate(String(updateId))
    const events = modules.telegramGateway.getTestTelegramGatewayEvents()
    const edited = events.find((event) => event.type === "editMessageText")
    assert.ok(edited && edited.type === "editMessageText")
    assert.ok(
      events.some(
        (event) =>
          event.type === "answerCallbackQuery" &&
          event.callbackQueryId === callbackId
      )
    )
    if (data === "menu:subscription") {
      assert.match(edited.text, /Статус: активна/)
      assert.match(edited.text, /Устройств: 4/)
      assert.match(edited.text, /LTE-доступ: есть/)
      assert.match(edited.text, /Remnawave: синхронизирована/)
      assert.match(
        JSON.stringify(edited.replyMarkup),
        /https:\/\/sub.pulsar-cloud.space\/test-user/
      )
    }
    if (data === "menu:balance") assert.match(edited.text, /Доступно: 123 ₽/)
    if (data === "menu:referrals") {
      assert.match(edited.text, /Реферальная ссылка: http:\/\/localhost:3000/)
      assert.match(JSON.stringify(edited.replyMarkup), /copy_text/)
    }
  }
})

test("/start login token signs in the existing Telegram identity", async () => {
  const identity = await modules.db.authIdentity.findUniqueOrThrow({
    where: { telegramId: "900000201" },
  })
  const challenge = await modules.auth.requestTelegramChallenge({})
  const token = telegramStartToken(challenge.url)
  const response = await modules.telegramWebhook.POST(
    telegramWebhookRequest({
      update_id: 220009,
      message: {
        text: `/start ${token}`,
        chat: { id: 900000201, type: "private" },
        from: { id: 900000201, username: "menu_user" },
      },
    })
  )
  assert.equal(response.status, 200)
  await processTelegramUpdate("220009")
  assert.equal(
    (
      await modules.db.authIdentity.findUniqueOrThrow({
        where: { telegramId: "900000201" },
      })
    ).userId,
    identity.userId
  )
  const completed = await modules.db.loginChallenge.findUniqueOrThrow({
    where: { id: challenge.challengeId },
  })
  assert.equal(completed.status, "COMPLETED")
  assert.ok(completed.completionTokenHash)
  const completionJob = await modules.db.outboxJob.findFirstOrThrow({
    where: {
      type: "SEND_TELEGRAM_LOGIN_COMPLETION",
      aggregateId: challenge.challengeId,
    },
  })
  modules.telegramGateway.resetTestTelegramGatewayEvents()
  await modules.jobs.handleJob(completionJob)
  const completionMessage = modules.telegramGateway
    .getTestTelegramGatewayEvents()
    .find((event) => event.type === "sendMessage")
  assert.ok(completionMessage?.type === "sendMessage")
  const completionMarkup = JSON.stringify(completionMessage.replyMarkup)
  assert.match(completionMarkup, /Вернуться в Pulsar/)
  assert.match(completionMarkup, /\/api\/auth\/telegram\/complete\?token=/)
  assert.doesNotMatch(completionMarkup, /web_app/)
})

test("Telegram linking rejects an identity owned by another shared user", async () => {
  const ownerIdentity = await modules.db.authIdentity.findUniqueOrThrow({
    where: { telegramId: "900000201" },
  })
  const target = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const challenge = await modules.auth.requestTelegramChallenge({
    purpose: "LINK_TELEGRAM",
    requestedByUserId: target.id,
  })
  await assert.rejects(
    () =>
      modules.auth.completeTelegramStart({
        challengeId: challenge.challengeId,
        rawStartToken: telegramStartToken(challenge.url),
        telegramId: "900000201",
        chatId: "900000201",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_IDENTITY_IN_USE"
  )
  assert.equal(
    (
      await modules.db.authIdentity.findUniqueOrThrow({
        where: { telegramId: "900000201" },
      })
    ).userId,
    ownerIdentity.userId
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

test("Telegram webhook rejects an invalid secret without persisting the update", async () => {
  const response = await modules.telegramWebhook.POST(
    telegramWebhookRequest(
      {
        update_id: 220006,
        message: {
          text: "/start",
          chat: { id: 900000206, type: "private" },
          from: { id: 900000206 },
        },
      },
      "wrong-secret-value"
    )
  )
  assert.equal(response.status, 401)
  assert.equal(
    await modules.db.telegramUpdateLog.count({
      where: { updateId: "220006" },
    }),
    0
  )
})

test("my_chat_member tracks bot blocking and unblocking", async () => {
  for (const [updateId, status, expected] of [
    [220007, "kicked", false],
    [220008, "member", true],
  ] as const) {
    await modules.telegramWebhook.POST(
      telegramWebhookRequest({
        update_id: updateId,
        my_chat_member: {
          chat: { id: 900000201, type: "private" },
          from: { id: 900000201 },
          new_chat_member: { status },
        },
      })
    )
    await processTelegramUpdate(String(updateId))
    const profile = await modules.db.telegramProfile.findUniqueOrThrow({
      where: { telegramId: "900000201" },
    })
    assert.equal(profile.canReceiveMessages, expected)
    assert.equal(Boolean(profile.botBlockedAt), !expected)
  }
})

test("Telegram webhook persists only a start-token hash", async () => {
  const challenge = await modules.auth.requestTelegramChallenge({})
  const token = telegramStartToken(challenge.url)
  assert.ok(token)
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

test("Telegram completion works across browsers, stays one-time, and expires", async () => {
  const challenge = await modules.auth.requestTelegramChallenge({})
  const token = telegramStartToken(challenge.url)
  assert.ok(token)
  const completed = await modules.auth.completeTelegramStart({
    rawStartToken: token,
    telegramId: "900000001",
    username: "tester",
    chatId: "900000001",
  })
  assert.ok(completed.completionToken)
  await assert.rejects(
    () =>
      modules.auth.consumeTelegramCompletion({
        rawCompletionToken: completed.completionToken!,
        challengeId: "wrong-challenge",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_CHALLENGE_EXPIRED"
  )
  const session = await modules.auth.consumeTelegramCompletion({
    rawCompletionToken: completed.completionToken!,
    challengeId: challenge.challengeId,
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
    })
  )

  const expiringChallenge = await modules.auth.requestTelegramChallenge({})
  const expiringStart = await modules.auth.completeTelegramStart({
    rawStartToken: telegramStartToken(expiringChallenge.url),
    telegramId: "900000012",
    username: "expired_completion",
    chatId: "900000012",
  })
  await modules.db.loginChallenge.update({
    where: { id: expiringChallenge.challengeId },
    data: { consumedAt: new Date(Date.now() - 5 * 60_000 - 1) },
  })
  await assert.rejects(
    () =>
      modules.auth.consumeTelegramCompletion({
        rawCompletionToken: expiringStart.completionToken!,
        challengeId: expiringChallenge.challengeId,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "AUTH_CHALLENGE_EXPIRED"
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

test("production test mode uses real auth adapters and hides the development OTP", async () => {
  const configModule = await import("@/src/server/config")
  const [{ getEmailSender }, { getTelegramGateway }] = await Promise.all([
    import("@/src/server/infrastructure/email"),
    import("@/src/server/infrastructure/telegram/gateway"),
  ])
  try {
    process.env.APP_ENV = "production"
    process.env.PULSAR_TEST_MODE = "true"
    process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "true"
    process.env.DATABASE_URL = `file:${databaseFile.replaceAll("\\", "/")}`

    const resendKey = process.env.RESEND_API_KEY
    delete process.env.RESEND_API_KEY
    configModule.resetConfigForTests()
    assert.throws(() => configModule.getConfig(), /RESEND_API_KEY is required/i)
    process.env.RESEND_API_KEY = resendKey

    const telegramToken = process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_BOT_TOKEN
    configModule.resetConfigForTests()
    assert.throws(
      () => configModule.getConfig(),
      /TELEGRAM_BOT_TOKEN.*required/i
    )
    process.env.TELEGRAM_BOT_TOKEN = telegramToken

    configModule.resetConfigForTests()
    const config = configModule.getConfig()
    assert.equal(config.testMode, true)
    assert.equal(config.localAuthAdaptersEnabled, false)
    assert.equal(getEmailSender().constructor.name, "ResendEmailSender")
    assert.equal(getTelegramGateway().constructor.name, "BotApiGateway")

    const email = await modules.auth.requestEmailChallenge({
      email: "production-test-auth@example.com",
    })
    assert.equal(email.devOtp, undefined)

    const telegram = await modules.auth.requestTelegramChallenge({})
    const telegramUrl = new URL(telegram.url)
    assert.equal(telegramUrl.origin, "https://t.me")
    assert.equal(telegramUrl.pathname, `/${process.env.TELEGRAM_BOT_USERNAME}`)
    assert.ok(telegramUrl.searchParams.get("start"))
    await assert.rejects(
      () =>
        modules.auth.getPendingTelegramTestChallenge({
          challengeId: telegram.challengeId,
          rawStartToken: telegramStartToken(telegram.url),
        }),
      (error: unknown) => (error as { code?: string }).code === "NOT_FOUND"
    )

    const completed = await modules.auth.completeTelegramStart({
      challengeId: telegram.challengeId,
      rawStartToken: telegramStartToken(telegram.url),
      telegramId: "900000013",
      username: "production_test_auth",
      chatId: "900000013",
    })
    assert.equal(
      (
        await modules.db.user.findUniqueOrThrow({
          where: { id: completed.userId },
        })
      ).isTest,
      true
    )
  } finally {
    process.env.APP_ENV = "test"
    process.env.PULSAR_TEST_MODE = "true"
    process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "false"
    process.env.DATABASE_URL = `file:${databaseFile.replaceAll("\\", "/")}`
    process.env.RESEND_API_KEY = "re_test_pulsar_auth"
    process.env.TELEGRAM_BOT_TOKEN = "123456789:test-pulsar-bot-token"
    configModule.resetConfigForTests()
    configModule.getConfig()
  }
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

test("renewal applies plan parameters immediately and keeps the subscription URL", async () => {
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
  const initialJob = await modules.db.outboxJob.findFirstOrThrow({
    where: {
      type: "PROVISION_SUBSCRIPTION",
      aggregateId: firstPeriod.id,
    },
    orderBy: { createdAt: "desc" },
  })
  await modules.jobs.handleJob({ ...initialJob, attempts: 1 })
  const provisioned = await modules.db.subscription.findUniqueOrThrow({
    where: { id: firstPeriod.id },
  })
  assert.ok(provisioned.subscriptionUrl)
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
  const renewed = await modules.db.subscription.findUniqueOrThrow({
    where: { userId: user.id },
  })
  assert.equal(renewed.deviceLimit, 2)
  assert.equal(renewed.lteEnabled, true)
  assert.equal(renewed.nextDeviceLimit, null)
  assert.equal(renewed.nextLteEnabled, null)
  assert.equal(renewed.nextParametersAt, null)
  assert.equal(
    renewed.expiresAt.getTime(),
    firstPeriod.expiresAt.getTime() + 30 * 86_400_000
  )
  const renewalJob = await modules.db.outboxJob.findFirstOrThrow({
    where: {
      type: "PROVISION_SUBSCRIPTION",
      aggregateId: renewed.id,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
  })
  await modules.jobs.handleJob({ ...renewalJob, attempts: 1 })
  const synced = await modules.db.subscription.findUniqueOrThrow({
    where: { id: renewed.id },
  })
  assert.equal(synced.subscriptionUrl, provisioned.subscriptionUrl)
})

test("device limit upgrade charges per added slot without extending the subscription", async () => {
  const user = await modules.db.$transaction((tx) =>
    modules.users.createUserGraph(tx, { isTest: true })
  )
  const initial = await modules.billing.createCheckout({
    userId: user.id,
    durationMonths: 1,
    deviceLimit: 1,
    lteEnabled: false,
    idempotencyKey: "device-upgrade-initial",
  })
  await modules.billing.applyPaymentEvent({
    eventId: "device-upgrade-initial-confirmed",
    eventType: "CONFIRMED",
    externalPaymentId: initial.externalPaymentId!,
    status: "CONFIRMED",
    amountMinor: initial.amountMinor,
    currency: initial.currency,
    payload: { id: initial.externalPaymentId, status: "CONFIRMED" },
  })
  const initialSubscription = await modules.db.subscription.findUniqueOrThrow({
    where: { userId: user.id },
  })
  const initialProvisionJob = await modules.db.outboxJob.findFirstOrThrow({
    where: {
      type: "PROVISION_SUBSCRIPTION",
      aggregateId: initialSubscription.id,
    },
    orderBy: { createdAt: "desc" },
  })
  await modules.jobs.handleJob({ ...initialProvisionJob, attempts: 1 })
  const provisioned = await modules.db.subscription.findUniqueOrThrow({
    where: { id: initialSubscription.id },
  })

  const selection = { userId: user.id, targetDeviceLimit: 3 }
  const expectation =
    await modules.billing.getDeviceLimitUpgradeExpectation(selection)
  assert.equal(expectation.expectedAmountMinor, 10_000)
  const payment = await modules.billing.createDeviceLimitUpgradeCheckout({
    ...selection,
    ...expectation,
    idempotencyKey: "device-upgrade-payment",
  })
  assert.equal(payment.purpose, "DEVICE_LIMIT_UPGRADE")
  assert.equal(payment.durationDays, 0)
  assert.equal(payment.amountMinor, 10_000)

  await modules.billing.applyPaymentEvent({
    eventId: "device-upgrade-confirmed",
    eventType: "CONFIRMED",
    externalPaymentId: payment.externalPaymentId!,
    status: "CONFIRMED",
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    payload: { id: payment.externalPaymentId, status: "CONFIRMED" },
  })

  const upgraded = await modules.db.subscription.findUniqueOrThrow({
    where: { id: provisioned.id },
  })
  assert.equal(upgraded.deviceLimit, 3)
  assert.equal(upgraded.expiresAt.getTime(), provisioned.expiresAt.getTime())
  assert.equal(upgraded.syncStatus, "PENDING")
  assert.equal(
    await modules.db.subscriptionEvent.count({
      where: { paymentId: payment.id, type: "DEVICE_LIMIT_UPGRADED" },
    }),
    1
  )
  assert.equal(
    await modules.db.outboxJob.count({
      where: {
        type: "PROVISION_SUBSCRIPTION",
        aggregateId: provisioned.id,
        status: "PENDING",
        dedupeKey: `subscription:${provisioned.id}:sync:${upgraded.syncVersion}`,
      },
    }),
    1
  )

  const upgradeJob = await modules.db.outboxJob.findFirstOrThrow({
    where: {
      type: "PROVISION_SUBSCRIPTION",
      aggregateId: provisioned.id,
      status: "PENDING",
      dedupeKey: `subscription:${provisioned.id}:sync:${upgraded.syncVersion}`,
    },
  })
  await modules.jobs.handleJob({ ...upgradeJob, attempts: 1 })
  await assert.rejects(
    () =>
      modules.billing.getDeviceLimitUpgradeExpectation({
        userId: user.id,
        targetDeviceLimit: 3,
      }),
    (error: unknown) => (error as { code?: string }).code === "INVALID_INPUT"
  )
  await assert.rejects(
    () =>
      modules.billing.getDeviceLimitUpgradeExpectation({
        userId: user.id,
        targetDeviceLimit: 6,
      }),
    (error: unknown) => (error as { code?: string }).code === "INVALID_INPUT"
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

test("test mode requires test payments and explicit isolated live Remnawave opt-in", async () => {
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
  process.env.PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE = "false"
  assert.throws(
    () => config.getConfig(),
    /requires REMNAWAVE_PROVIDER=mock unless PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE=true/i
  )

  process.env.PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE = "true"
  process.env.REMNAWAVE_BASE_URL = "https://panel.example.test"
  process.env.REMNAWAVE_API_TOKEN = "dedicated-local-test-token"
  process.env.REMNAWAVE_STANDARD_SQUAD_UUID =
    "11111111-1111-4111-8111-111111111111"
  process.env.REMNAWAVE_LTE_SQUAD_UUID = "22222222-2222-4222-8222-222222222222"
  process.env.REMNAWAVE_USER_NAMESPACE = "pulsar"
  config.resetConfigForTests()
  assert.throws(
    () => config.getConfig(),
    /requires a dedicated REMNAWAVE_USER_NAMESPACE/i
  )

  process.env.REMNAWAVE_USER_NAMESPACE = "pulsar_local_test"
  config.resetConfigForTests()
  const liveTestConfig = config.getConfig()
  assert.equal(liveTestConfig.remnawave.provider, "http")
  assert.equal(liveTestConfig.remnawave.userNamespace, "pulsar_local_test")
  assert.equal(liveTestConfig.remnawave.allowLiveInTestMode, true)

  process.env.APP_ENV = "production"
  process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "true"
  process.env.DATABASE_URL = "file:./prisma/pulsar-vps-test.db"
  config.resetConfigForTests()
  const productionLiveTestConfig = config.getConfig()
  assert.equal(productionLiveTestConfig.testMode, true)
  assert.equal(productionLiveTestConfig.remnawave.provider, "http")
  assert.equal(
    productionLiveTestConfig.remnawave.userNamespace,
    "pulsar_local_test"
  )

  process.env.APP_ENV = "test"
  process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "false"
  process.env.PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE = "false"
  process.env.REMNAWAVE_PROVIDER = "mock"
  process.env.REMNAWAVE_USER_NAMESPACE = "pulsar"
  process.env.DATABASE_URL = `file:${databaseFile.replaceAll("\\", "/")}`
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

test("verified renewal applies the paid parameters immediately", async () => {
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
        type: "PAYMENT_EXTENDED",
      },
    }),
    1
  )
  const subscription = await modules.db.subscription.findUniqueOrThrow({
    where: { userId: user.id },
  })
  assert.equal(subscription.deviceLimit, 3)
  assert.equal(subscription.lteEnabled, true)
  assert.equal(subscription.nextDeviceLimit, null)
  assert.equal(subscription.nextLteEnabled, null)
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
