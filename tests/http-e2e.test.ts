import assert from "node:assert/strict"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createDecipheriv, createHmac } from "node:crypto"
import { writeFileSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import BetterSqlite3 from "better-sqlite3"

const port = 31_987
const origin = `http://127.0.0.1:${port}`
const databaseFile = resolve("prisma/http-e2e.db")

const testEnv = {
  ...process.env,
  APP_ENV: "test",
  APP_URL: origin,
  DATABASE_URL: "file:./prisma/http-e2e.db",
  SESSION_SECRET: "http-e2e-session-secret-at-least-32-characters",
  AUTH_PEPPER: "http-e2e-auth-pepper-at-least-32-characters",
  DATA_ENCRYPTION_KEY: "33".repeat(32),
  ADMIN_EMAIL: "admin-http@pulsar.local",
  ADMIN_TELEGRAM_ID: "885112484",
  PULSAR_TEST_MODE: "true",
  PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION: "false",
  PULSAR_HTTP_E2E: "true",
  PAYMENT_PROVIDER: "test",
  PAYMENT_WEBHOOK_SECRET: "http-e2e-webhook-secret",
  REMNAWAVE_PROVIDER: "mock",
  TELEGRAM_BOT_USERNAME: "pulsar_http_test_bot",
  WORKER_POLL_INTERVAL_MS: "250",
  WORKER_LEASE_MS: "5000",
  WORKER_BATCH_SIZE: "20",
} satisfies NodeJS.ProcessEnv

function removeDatabase() {
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(`${databaseFile}${suffix}`, { force: true })
}

async function removeDatabaseWithRetry() {
  let lastError: unknown
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      removeDatabase()
      return
    } catch (error) {
      lastError = error
      const code = (error as NodeJS.ErrnoException).code
      if (!code || !["EBUSY", "EPERM", "EACCES"].includes(code)) throw error
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
    }
  }
  throw lastError
}

function runNode(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    cwd: resolve("."),
    env: testEnv,
    encoding: "utf8",
  })
  if (result.status !== 0)
    throw new Error(
      `Command failed: node ${args.join(" ")}\n${result.stdout}\n${result.stderr}`
    )
}

async function waitForServer(process: ChildProcess, output: () => string) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (process.exitCode !== null)
      throw new Error(`Next server exited early\n${output()}`)
    try {
      const response = await fetch(`${origin}/api/health/live`)
      if (response.ok) return
    } catch {
      // The dev server is still compiling.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error(`Timed out waiting for Next server\n${output()}`)
}

async function postJson(path: string, body: unknown, cookie?: string) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  })
}

async function assertStatus(response: Response, expected = 200) {
  if (response.status !== expected)
    assert.fail(
      `Expected HTTP ${expected}, received ${response.status}: ${await response.text()}`
    )
}

type TelegramStart = {
  challengeId: string
  startToken: string
  url: string
}

type EmailMagicStart = {
  challengeId: string
  email: string
  magicLinkToken: string
}

function decryptSensitive(value: string) {
  const [version, iv, tag, encrypted] = value.split(".")
  assert.equal(version, "v1")
  assert.ok(iv)
  assert.ok(tag)
  assert.ok(encrypted)
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(testEnv.DATA_ENCRYPTION_KEY!, "hex"),
    Buffer.from(iv, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

function assertRedirectPath(response: Response, expected: string) {
  assert.equal(response.status, 307)
  const location = response.headers.get("location")
  assert.ok(location)
  const actual = new URL(location, origin)
  assert.equal(`${actual.pathname}${actual.search}`, expected)
}

async function requestEmailMagic(email: string): Promise<EmailMagicStart> {
  const response = await postJson("/api/auth/email/request", { email })
  await assertStatus(response)
  assert.equal(response.headers.get("set-cookie"), null)
  const body = (await response.json()) as { challengeId: string }
  const sqlite = new BetterSqlite3(databaseFile, { readonly: true })
  try {
    const job = sqlite
      .prepare(
        `SELECT "payloadJson" FROM "OutboxJob"
         WHERE "type" = 'SEND_EMAIL_OTP' AND "aggregateId" = ?
         ORDER BY "createdAt" DESC LIMIT 1`
      )
      .get(body.challengeId) as { payloadJson: string }
    const payload = JSON.parse(job.payloadJson) as {
      magicLinkTokenEncrypted: string
    }
    return {
      challengeId: body.challengeId,
      email,
      magicLinkToken: decryptSensitive(payload.magicLinkTokenEncrypted),
    }
  } finally {
    sqlite.close()
  }
}

async function requestEmailMagicCompletion(challenge: EmailMagicStart) {
  return fetch(
    `${origin}/auth/verify/link?challenge=${encodeURIComponent(challenge.challengeId)}&token=${encodeURIComponent(challenge.magicLinkToken)}`,
    { redirect: "manual" }
  )
}

function assertEmailMagicProjection(
  challenge: EmailMagicStart,
  expected: { status: string; sessions: number; tokenPresent: boolean }
) {
  const sqlite = new BetterSqlite3(databaseFile, { readonly: true })
  try {
    const projection = sqlite
      .prepare(
        `SELECT lc."status", lc."magicLinkTokenHash",
                (SELECT count(*)
                 FROM "Session" s
                 JOIN "AuthIdentity" ai ON ai."userId" = s."userId"
                 WHERE ai."emailNormalized" = ?) AS sessions
         FROM "LoginChallenge" lc WHERE lc."id" = ?`
      )
      .get(challenge.email, challenge.challengeId) as {
      status: string
      magicLinkTokenHash: string | null
      sessions: number
    }
    assert.equal(projection.status, expected.status)
    assert.equal(projection.sessions, expected.sessions)
    assert.equal(Boolean(projection.magicLinkTokenHash), expected.tokenPresent)
  } finally {
    sqlite.close()
  }
}

async function requestTelegramStart(): Promise<TelegramStart> {
  const response = await postJson("/api/auth/telegram/start", {
    purpose: "USER_LOGIN",
  })
  await assertStatus(response)
  assert.equal(response.headers.get("set-cookie"), null)
  const body = (await response.json()) as { challengeId: string; url: string }
  assert.match(body.challengeId, /^[A-Za-z0-9_-]{8,128}$/)
  const url = new URL(body.url)
  const startToken = url.searchParams.get("token") ?? ""
  assert.equal(url.origin, origin)
  assert.equal(url.pathname, `/test/telegram/${body.challengeId}`)
  assert.ok(startToken)
  return {
    challengeId: body.challengeId,
    startToken,
    url: body.url,
  }
}

function seedTelegramCompletion(challengeId: string) {
  const completionToken = `http-completion-${challengeId}`
  const completionTokenHash = createHmac("sha256", testEnv.SESSION_SECRET!)
    .update(completionToken)
    .digest("hex")
  const userId = `http-user-${challengeId}`
  const identityId = `http-identity-${challengeId}`
  const telegramId = `http-${challengeId}`
  const now = new Date().toISOString()
  const sqlite = new BetterSqlite3(databaseFile)
  sqlite.pragma("busy_timeout = 5000")
  try {
    sqlite.transaction(() => {
      sqlite
        .prepare(
          `INSERT INTO "User" ("id", "role", "status", "isTest", "updatedAt")
           VALUES (?, 'USER', 'ACTIVE', 1, ?)`
        )
        .run(userId, now)
      sqlite
        .prepare(
          `INSERT INTO "AuthIdentity"
             ("id", "userId", "provider", "providerSubject", "telegramId",
              "verifiedAt", "updatedAt")
           VALUES (?, ?, 'TELEGRAM', ?, ?, ?, ?)`
        )
        .run(identityId, userId, telegramId, telegramId, now, now)
      const updated = sqlite
        .prepare(
          `UPDATE "LoginChallenge"
           SET "status" = 'COMPLETED', "telegramId" = ?,
               "telegramStartTokenHash" = NULL, "completionTokenHash" = ?,
               "consumedAt" = ?
           WHERE "id" = ?`
        )
        .run(telegramId, completionTokenHash, now, challengeId)
      assert.equal(updated.changes, 1)
    })()
  } finally {
    sqlite.close()
  }
  return { completionToken, userId }
}

async function requestTelegramCompletion(
  challengeId: string,
  completionToken: string
) {
  return fetch(
    `${origin}/api/auth/telegram/complete?token=${encodeURIComponent(completionToken)}&challenge=${encodeURIComponent(challengeId)}`,
    { redirect: "manual" }
  )
}

function assertTelegramCompletionUnconsumed(
  challengeId: string,
  userId: string
) {
  const sqlite = new BetterSqlite3(databaseFile, { readonly: true })
  try {
    const projection = sqlite
      .prepare(
        `SELECT lc."completionTokenHash" AS completionTokenHash,
                (SELECT count(*) FROM "Session" s WHERE s."userId" = ?) AS sessions
         FROM "LoginChallenge" lc
         WHERE lc."id" = ?`
      )
      .get(userId, challengeId) as {
      completionTokenHash: string | null
      sessions: number
    }
    assert.ok(projection.completionTokenHash)
    assert.equal(projection.sessions, 0)
  } finally {
    sqlite.close()
  }
}

async function login(
  email: string,
  invite?: string,
  purpose: "USER_LOGIN" | "ADMIN_LOGIN" = "USER_LOGIN"
) {
  const requested = await postJson("/api/auth/email/request", {
    email,
    invite,
    purpose,
  })
  await assertStatus(requested)
  assert.equal(requested.headers.get("set-cookie"), null)
  const challenge = (await requested.json()) as {
    challengeId: string
    devOtp: string
  }
  const verified = await postJson("/api/auth/email/verify", {
    challengeId: challenge.challengeId,
    otp: challenge.devOtp,
  })
  await assertStatus(verified)
  const setCookie = verified.headers.get("set-cookie")
  assert.ok(setCookie)
  assert.match(setCookie, /Max-Age=15552000/i)
  return setCookie.split(";", 1)[0]
}

async function createAndConfirmPayment(
  cookie: string,
  key: string,
  expectedAmountMinor = 11_900
) {
  const checkout = await postJson(
    "/api/payments/checkout",
    {
      durationMonths: 1,
      deviceLimit: 1,
      lteEnabled: false,
      expectedAmountMinor,
      pricingVersion: 4,
      idempotencyKey: key,
    },
    cookie
  )
  await assertStatus(checkout)
  const payment = (await checkout.json()) as { paymentId: string }
  const eventId = `http-e2e:${payment.paymentId}:confirmed`
  const confirmed = await postJson(
    `/api/test/payments/${payment.paymentId}`,
    { status: "CONFIRMED", duplicateEventId: eventId },
    cookie
  )
  await assertStatus(confirmed)
  const duplicate = await postJson(
    `/api/test/payments/${payment.paymentId}`,
    { status: "CONFIRMED", duplicateEventId: eventId },
    cookie
  )
  await assertStatus(duplicate)
  return payment.paymentId
}

test(
  "HTTP auth, referral, payment, and worker flows",
  { timeout: 90_000 },
  async (context) => {
    await removeDatabaseWithRetry()
    writeFileSync(databaseFile, "")
    runNode(["node_modules/prisma/build/index.js", "migrate", "deploy"])
    runNode(["--import", "tsx", "prisma/seed.ts", "admin"])
    const fixtureDb = new BetterSqlite3(databaseFile)
    fixtureDb
      .prepare(
        `INSERT INTO "OutboxJob"
          ("id", "type", "aggregateType", "aggregateId", "payloadJson",
           "dedupeKey", "status", "attempts", "maxAttempts", "runAfter",
           "lockedAt", "lockedBy", "createdAt")
         VALUES (?, ?, ?, ?, ?, ?, 'PROCESSING', 0, 1, ?, ?, ?, ?)`
      )
      .run(
        "http-stale-lease",
        "UNSUPPORTED_TEST_JOB",
        "Test",
        "stale-lease",
        "{}",
        "http-e2e:stale-lease",
        new Date(Date.now() - 60_000).toISOString(),
        new Date(Date.now() - 60_000).toISOString(),
        "dead-worker",
        new Date(Date.now() - 60_000).toISOString()
      )
    fixtureDb.close()

    let output = ""
    const web = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "-p", String(port)],
      { cwd: resolve("."), env: testEnv, stdio: ["ignore", "pipe", "pipe"] }
    )
    const worker = spawn(
      process.execPath,
      ["--import", "tsx", "src/jobs/worker.ts"],
      { cwd: resolve("."), env: testEnv, stdio: ["ignore", "pipe", "pipe"] }
    )
    for (const child of [web, worker]) {
      child.stdout?.on("data", (chunk) => {
        output = `${output}${String(chunk)}`.slice(-12_000)
      })
      child.stderr?.on("data", (chunk) => {
        output = `${output}${String(chunk)}`.slice(-12_000)
      })
    }

    let primaryError: Error | undefined
    try {
      await waitForServer(web, () => output)

      await context.test(
        "Telegram completion works across browsers and remains one-time",
        async () => {
          const challenge = await requestTelegramStart()
          const otherChallenge = await requestTelegramStart()
          const seeded = seedTelegramCompletion(challenge.challengeId)

          const mismatched = await requestTelegramCompletion(
            otherChallenge.challengeId,
            seeded.completionToken
          )
          assertRedirectPath(mismatched, "/auth/verify?error=expired")
          assertTelegramCompletionUnconsumed(
            challenge.challengeId,
            seeded.userId
          )

          const response = await requestTelegramCompletion(
            challenge.challengeId,
            seeded.completionToken
          )
          assertRedirectPath(response, "/home")
          const setCookie = response.headers.get("set-cookie") ?? ""
          assert.match(setCookie, /pulsar_user_session=/)
          assert.doesNotMatch(setCookie, /pulsar_telegram_state_/)

          const replay = await requestTelegramCompletion(
            challenge.challengeId,
            seeded.completionToken
          )
          assertRedirectPath(replay, "/auth/verify?error=expired")

          const sqlite = new BetterSqlite3(databaseFile, { readonly: true })
          try {
            const projection = sqlite
              .prepare(
                `SELECT lc."completionTokenHash" AS completionTokenHash,
                        (SELECT count(*) FROM "Session" s WHERE s."userId" = ?) AS sessions
                 FROM "LoginChallenge" lc
                 WHERE lc."id" = ?`
              )
              .get(seeded.userId, challenge.challengeId) as {
              completionTokenHash: string | null
              sessions: number
            }
            assert.equal(projection.completionTokenHash, null)
            assert.equal(projection.sessions, 1)
          } finally {
            sqlite.close()
          }
        }
      )

      await context.test(
        "local Telegram simulator registers and signs in",
        async () => {
          const challenge = await requestTelegramStart()
          const simulatorPage = await fetch(challenge.url)
          await assertStatus(simulatorPage)
          assert.match(await simulatorPage.text(), /TEST MODE/)

          const crossOrigin = await fetch(
            `${origin}/api/test/telegram/${encodeURIComponent(challenge.challengeId)}`,
            {
              method: "POST",
              headers: {
                Origin: "https://attacker.example",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                token: challenge.startToken,
                telegramId: "900000099",
              }),
            }
          )
          await assertStatus(crossOrigin, 403)

          const simulated = await postJson(
            `/api/test/telegram/${encodeURIComponent(challenge.challengeId)}`,
            {
              token: challenge.startToken,
              telegramId: "900000099",
              username: "http_simulator",
            }
          )
          await assertStatus(simulated)
          const body = (await simulated.json()) as { redirectTo: string }
          assert.match(
            body.redirectTo,
            new RegExp(
              `^/api/auth/telegram/complete\\?challenge=${challenge.challengeId}&token=`
            )
          )

          const completed = await fetch(`${origin}${body.redirectTo}`, {
            redirect: "manual",
          })
          assert.equal(completed.status, 307)
          assert.equal(completed.headers.get("location"), `${origin}/home`)
          assert.match(
            completed.headers.get("set-cookie") ?? "",
            /pulsar_user_session=/
          )
        }
      )

      await context.test(
        "email magic links work across browsers, stay one-time, and expire",
        async () => {
          const initial = await requestEmailMagic(
            "http-magic-initial@pulsar.local"
          )
          const other = await requestEmailMagic("http-magic-other@pulsar.local")
          const mismatched = await requestEmailMagicCompletion({
            ...initial,
            challengeId: other.challengeId,
          })
          assertRedirectPath(mismatched, "/auth/verify?error=expired")
          assertEmailMagicProjection(initial, {
            status: "PENDING",
            sessions: 0,
            tokenPresent: true,
          })

          const completed = await requestEmailMagicCompletion(initial)
          assertRedirectPath(completed, "/home")
          const completedCookies = completed.headers.get("set-cookie") ?? ""
          assert.match(completedCookies, /pulsar_user_session=/)
          assert.match(completedCookies, /Max-Age=15552000/i)
          assert.doesNotMatch(completedCookies, /pulsar_email_state_/)
          assertEmailMagicProjection(initial, {
            status: "COMPLETED",
            sessions: 1,
            tokenPresent: true,
          })

          const replay = await requestEmailMagicCompletion(initial)
          assertRedirectPath(replay, "/auth/verify?error=used")
          assertEmailMagicProjection(initial, {
            status: "COMPLETED",
            sessions: 1,
            tokenPresent: true,
          })

          const expired = await requestEmailMagic(
            "http-magic-expired@pulsar.local"
          )
          const expirationDb = new BetterSqlite3(databaseFile)
          expirationDb
            .prepare(
              `UPDATE "LoginChallenge" SET "expiresAt" = ? WHERE "id" = ?`
            )
            .run(
              new Date(Date.now() - 1_000).toISOString(),
              expired.challengeId
            )
          expirationDb.close()
          const expiredResponse = await requestEmailMagicCompletion(expired)
          assertRedirectPath(expiredResponse, "/auth/verify?error=expired")
          assertEmailMagicProjection(expired, {
            status: "EXPIRED",
            sessions: 0,
            tokenPresent: true,
          })
        }
      )

      await context.test(
        "root routes separate USER and ADMIN sessions",
        async () => {
          const anonymous = await fetch(`${origin}/`, { redirect: "manual" })
          await assertStatus(anonymous)

          const userCookie = await login("http-root-user@pulsar.local")
          assert.match(userCookie, /^pulsar_user_session=/)
          const userRoot = await fetch(`${origin}/`, {
            headers: { Cookie: userCookie },
            redirect: "manual",
          })
          assertRedirectPath(userRoot, "/home")

          const adminCookie = await login(
            testEnv.ADMIN_EMAIL!,
            undefined,
            "ADMIN_LOGIN"
          )
          assert.match(adminCookie, /^pulsar_admin_session=/)
          const adminRoot = await fetch(`${origin}/`, {
            headers: { Cookie: adminCookie },
            redirect: "manual",
          })
          assertRedirectPath(adminRoot, "/admin/dashboard")

          const bothRoot = await fetch(`${origin}/`, {
            headers: { Cookie: `${userCookie}; ${adminCookie}` },
            redirect: "manual",
          })
          assertRedirectPath(bothRoot, "/admin/dashboard")
        }
      )

      await context.test(
        "logout allows an immediate email login request",
        async () => {
          const email = "http-immediate-relogin@pulsar.local"
          const sessionCookie = await login(email)
          const logout = await postJson("/api/auth/logout", {}, sessionCookie)
          await assertStatus(logout)

          const nextRequest = await postJson("/api/auth/email/request", {
            email,
          })
          await assertStatus(nextRequest)
          assert.equal(nextRequest.headers.get("set-cookie"), null)
          const nextChallenge = (await nextRequest.json()) as {
            challengeId: string
            devOtp: string
          }
          assert.match(nextChallenge.devOtp, /^\d{6}$/)

          const sqlite = new BetterSqlite3(databaseFile, { readonly: true })
          try {
            const statuses = sqlite
              .prepare(
                `SELECT lc."status" FROM "LoginChallenge" lc
                 WHERE lc."emailNormalized" = ? ORDER BY lc."createdAt"`
              )
              .all(email) as Array<{ status: string }>
            assert.deepEqual(
              statuses.map((row) => row.status),
              ["COMPLETED", "PENDING"]
            )
          } finally {
            sqlite.close()
          }
        }
      )

      await context.test("direct app responses deny framing", async () => {
        const response = await fetch(`${origin}/api/health/live`)
        await assertStatus(response)
        assert.equal(
          response.headers.get("content-security-policy"),
          "frame-ancestors 'none'"
        )
        assert.equal(response.headers.get("x-frame-options"), "DENY")
      })

      const inviterCookie = await login("http-inviter@pulsar.local")
      await createAndConfirmPayment(inviterCookie, "http-inviter-payment")

      const inviteDb = new BetterSqlite3(databaseFile, { readonly: true })
      let invite: { code: string }
      try {
        invite = inviteDb
          .prepare(
            `SELECT rp."inviteCode" AS code
             FROM "ReferralProfile" rp
             JOIN "AuthIdentity" ai ON ai."userId" = rp."userId"
             WHERE ai."emailNormalized" = ? AND rp."isEnabled" = 1`
          )
          .get("http-inviter@pulsar.local") as { code: string }
      } finally {
        inviteDb.close()
      }
      assert.ok(invite.code)

      const friendCookie = await login("http-friend@pulsar.local", invite.code)
      const friendPaymentId = await createAndConfirmPayment(
        friendCookie,
        "http-friend-payment",
        11_900
      )

      let projection:
        | {
            syncStatus: string
            subscriptionUrl: string | null
            rewardMinor: number
            trialDays: number
            subscriptionEvents: number
          }
        | undefined
      const projectionDb = new BetterSqlite3(databaseFile, { readonly: true })
      try {
        const deadline = Date.now() + 15_000
        while (Date.now() < deadline) {
          projection = projectionDb
            .prepare(
              `SELECT s."syncStatus", s."subscriptionUrl",
                      iw."availableMinor" AS rewardMinor,
                      tg."days" AS trialDays,
                      (SELECT count(*) FROM "SubscriptionEvent" se
                       WHERE se."paymentId" = ?) AS subscriptionEvents
               FROM "AuthIdentity" friend
               JOIN "Subscription" s ON s."userId" = friend."userId"
               JOIN "TrialGrant" tg ON tg."userId" = friend."userId"
               JOIN "ReferralInvite" ri ON ri."invitedUserId" = friend."userId"
               JOIN "WalletAccount" iw ON iw."userId" = ri."inviterUserId"
               WHERE friend."emailNormalized" = ?`
            )
            .get(friendPaymentId, "http-friend@pulsar.local") as
            typeof projection | undefined
          if (projection?.syncStatus === "SYNCED" && projection.subscriptionUrl)
            break
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
        }
      } finally {
        projectionDb.close()
      }

      assert.equal(projection?.syncStatus, "SYNCED")
      assert.match(projection?.subscriptionUrl ?? "", /\/test\/sub\//)
      assert.equal(projection?.rewardMinor, 7_500)
      assert.equal(projection?.trialDays, 3)
      assert.equal(projection?.subscriptionEvents, 1)
      const leaseDb = new BetterSqlite3(databaseFile, { readonly: true })
      const recovered = leaseDb
        .prepare(`SELECT "status", "attempts" FROM "OutboxJob" WHERE "id" = ?`)
        .get("http-stale-lease") as { status: string; attempts: number }
      leaseDb.close()
      assert.equal(recovered.status, "DEAD")
      assert.equal(recovered.attempts, 1)
    } catch (error) {
      primaryError = new Error(
        `${error instanceof Error ? error.stack : String(error)}\nChild process output:\n${output}`
      )
      throw primaryError
    } finally {
      worker.kill("SIGTERM")
      web.kill("SIGTERM")
      await Promise.all(
        [worker, web].map(
          (child) =>
            new Promise<void>((resolveExit) => {
              if (child.exitCode !== null) resolveExit()
              else child.once("exit", () => resolveExit())
            })
        )
      )
      try {
        await removeDatabaseWithRetry()
      } catch (cleanupError) {
        if (!primaryError) throw cleanupError
        primaryError.message += `\nCleanup error: ${
          cleanupError instanceof Error
            ? cleanupError.stack
            : String(cleanupError)
        }`
      }
    }
  }
)
