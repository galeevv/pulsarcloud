import "dotenv/config"
import { fileURLToPath } from "node:url"
import { db, initializeDatabase } from "@/src/server/infrastructure/db/client"
import { getConfig } from "@/src/server/config"
import { createUserGraph } from "@/src/server/domain/users/service"

export async function seedPricing() {
  return db.pricingSettings.upsert({
    where: { key: "default" },
    create: {
      key: "default",
      baseMonthlyPriceMinor: 11_900,
      extraDeviceMonthlyPriceMinor: 5_000,
      lteMonthlyPriceMinor: 5_000,
      durationDiscountsJson: JSON.stringify({ 1: 0, 3: 10, 6: 15, 12: 20 }),
      minDeviceLimit: 1,
      maxDeviceLimit: 5,
      referralRewardMinor: 7_500,
      referralTrialDays: 3,
      minimalPayoutMinor: 15_000,
    },
    update: {},
  })
}

export async function bootstrapAdmin() {
  const config = getConfig().admin
  return db.$transaction(async (tx) => {
    const [emailIdentity, telegramIdentity] = await Promise.all([
      tx.authIdentity.findUnique({ where: { emailNormalized: config.email } }),
      tx.authIdentity.findUnique({ where: { telegramId: config.telegramId } }),
    ])
    if (
      emailIdentity &&
      telegramIdentity &&
      emailIdentity.userId !== telegramIdentity.userId
    )
      throw new Error(
        "Admin email and Telegram ID belong to different users; refusing automatic merge"
      )
    const existingUserId = emailIdentity?.userId ?? telegramIdentity?.userId
    const user = existingUserId
      ? await tx.user.findUniqueOrThrow({ where: { id: existingUserId } })
      : await createUserGraph(tx, { isTest: getConfig().testMode })
    await tx.user.update({
      where: { id: user.id },
      data: {
        role: "ADMIN",
        status: "ACTIVE",
        isTest: getConfig().testMode,
      },
    })
    if (!emailIdentity)
      await tx.authIdentity.create({
        data: {
          userId: user.id,
          provider: "EMAIL",
          providerSubject: config.email,
          emailNormalized: config.email,
          verifiedAt: new Date(),
        },
      })
    if (!telegramIdentity)
      await tx.authIdentity.create({
        data: {
          userId: user.id,
          provider: "TELEGRAM",
          providerSubject: config.telegramId,
          telegramId: config.telegramId,
          telegramUsername: config.telegramUsername,
          verifiedAt: new Date(),
        },
      })
    await tx.telegramProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        telegramId: config.telegramId,
        username: config.telegramUsername,
      },
      update: { username: config.telegramUsername },
    })
    return user
  })
}

export async function seedTestData() {
  if (!getConfig().testMode)
    throw new Error("Test data seed is disabled when PULSAR_TEST_MODE=false")
  const email = "test-user@pulsar.local"
  const existing = await db.authIdentity.findUnique({
    where: { emailNormalized: email },
  })
  if (existing) return existing
  return db.$transaction(async (tx) => {
    const user = await createUserGraph(tx, { isTest: true })
    return tx.authIdentity.create({
      data: {
        userId: user.id,
        provider: "EMAIL",
        providerSubject: email,
        emailNormalized: email,
        verifiedAt: new Date(),
      },
    })
  })
}

async function main() {
  await initializeDatabase()
  const command = process.argv[2] ?? "dev"
  await seedPricing()
  if (["dev", "admin"].includes(command)) await bootstrapAdmin()
  if (command === "test") await seedTestData()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
