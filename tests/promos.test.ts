import assert from "node:assert/strict"
import { readFileSync, readdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import test, { after, before } from "node:test"
import BetterSqlite3 from "better-sqlite3"

const databaseFile = resolve("prisma/promos.test.db")
process.env.APP_ENV = "test"
process.env.APP_URL = "http://localhost:3000"
process.env.DATABASE_URL = `file:${databaseFile.replaceAll("\\", "/")}`
process.env.SESSION_SECRET = "promo-test-session-secret-at-least-32-characters"
process.env.AUTH_PEPPER = "promo-test-auth-pepper-at-least-32-characters"
process.env.DATA_ENCRYPTION_KEY = "44".repeat(32)
process.env.ADMIN_EMAIL = "admin-promo@pulsar.local"
process.env.ADMIN_TELEGRAM_ID = "885112484"
process.env.PULSAR_TEST_MODE = "true"
process.env.PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "false"
process.env.PAYMENT_PROVIDER = "test"
process.env.PAYMENT_WEBHOOK_SECRET = "promo-test-webhook-secret"
process.env.REMNAWAVE_PROVIDER = "mock"

type Modules = Awaited<ReturnType<typeof loadModules>>
let modules: Modules

async function loadModules() {
  const [{ db, initializeDatabase }, users, promos] = await Promise.all([
    import("@/src/server/infrastructure/db/client"),
    import("@/src/server/domain/users/service"),
    import("@/src/server/domain/promos/service"),
  ])
  return { db, initializeDatabase, users, promos }
}

function removeDatabase() {
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(`${databaseFile}${suffix}`, { force: true })
}

before(async () => {
  removeDatabase()
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
})

after(async () => {
  await modules.db.$disconnect()
  removeDatabase()
})

test("launch promo grants immutable terms once and stops at the limit", async () => {
  const now = new Date()
  const admin = await modules.db.$transaction(async (tx) => {
    const user = await modules.users.createUserGraph(tx, { isTest: true })
    return tx.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    })
  })
  const campaign = await modules.db.promoCampaign.create({
    data: {
      slug: "launch-test",
      name: "Открытие Pulsar",
      status: "ACTIVE",
      claimLimit: 2,
      registrationWindowDays: 14,
      durationDays: 30,
      deviceLimit: 3,
      lteEnabled: true,
      startsAt: new Date(now.getTime() - 1_000),
      endsAt: new Date(now.getTime() + 14 * 86_400_000),
      isTest: true,
      createdByAdminId: admin.id,
    },
  })

  const first = await modules.db.$transaction(async (tx) => {
    const user = await modules.users.createUserGraph(tx, { isTest: true })
    const claim = await modules.promos.applyPromoOnRegistration(tx, {
      userId: user.id,
      now,
    })
    return { user, claim }
  })
  assert.ok(first.claim)
  assert.equal(first.claim.claimNumber, 1)

  const duplicate = await modules.db.$transaction((tx) =>
    modules.promos.applyPromoOnRegistration(tx, {
      userId: first.user.id,
      now,
    })
  )
  assert.equal(duplicate?.id, first.claim.id)

  const second = await modules.db.$transaction(async (tx) => {
    const user = await modules.users.createUserGraph(tx, { isTest: true })
    await tx.subscription.create({
      data: {
        userId: user.id,
        status: "TRIAL",
        startedAt: now,
        expiresAt: new Date(now.getTime() + 3 * 86_400_000),
        deviceLimit: 1,
        lteEnabled: false,
        syncStatus: "PENDING",
        syncVersion: 1,
      },
    })
    const claim = await modules.promos.applyPromoOnRegistration(tx, {
      userId: user.id,
      now,
    })
    return { user, claim }
  })
  assert.ok(second.claim)
  assert.equal(second.claim.claimNumber, 2)

  const third = await modules.db.$transaction(async (tx) => {
    const user = await modules.users.createUserGraph(tx, { isTest: true })
    const claim = await modules.promos.applyPromoOnRegistration(tx, {
      userId: user.id,
      now,
    })
    return { user, claim }
  })
  assert.equal(third.claim, null)

  const [updatedCampaign, firstSubscription, secondSubscription] =
    await Promise.all([
      modules.db.promoCampaign.findUniqueOrThrow({
        where: { id: campaign.id },
      }),
      modules.db.subscription.findUniqueOrThrow({
        where: { userId: first.user.id },
      }),
      modules.db.subscription.findUniqueOrThrow({
        where: { userId: second.user.id },
      }),
    ])
  assert.equal(updatedCampaign.claimedCount, 2)
  assert.equal(firstSubscription.status, "TRIAL")
  assert.equal(firstSubscription.deviceLimit, 3)
  assert.equal(firstSubscription.lteEnabled, true)
  assert.equal(firstSubscription.syncVersion, 1)
  assert.equal(secondSubscription.deviceLimit, 3)
  assert.equal(secondSubscription.lteEnabled, true)
  assert.equal(secondSubscription.syncVersion, 2)
  assert.equal(
    secondSubscription.expiresAt.getTime(),
    now.getTime() + 30 * 86_400_000
  )

  assert.equal(await modules.db.promoClaim.count(), 2)
  assert.equal(
    await modules.db.subscriptionEvent.count({
      where: { type: "PROMO_GRANTED" },
    }),
    2
  )
  assert.equal(
    await modules.db.outboxJob.count({
      where: { type: "PROVISION_SUBSCRIPTION" },
    }),
    2
  )
})
