import "dotenv/config"

import { db, initializeDatabase } from "@/src/server/infrastructure/db/client"
import { createUserGraph } from "@/src/server/domain/users/service"
import { encryptSensitive } from "@/src/server/infrastructure/security/crypto"
import { bootstrapAdmin, seedPricing } from "@/prisma/seed"

const DEMO_DATABASE_MARKER = "file:./prisma/dev.db"

function assertLocalDemoEnvironment() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (process.env.APP_ENV === "production")
    throw new Error("Refusing to seed demo data in production")
  if (process.env.PULSAR_TEST_MODE !== "true")
    throw new Error("Set PULSAR_TEST_MODE=true before seeding demo data")
  if (!databaseUrl.includes("dev.db") || !databaseUrl.startsWith("file:"))
    throw new Error(
      `Refusing to seed non-local database. Expected ${DEMO_DATABASE_MARKER}`
    )
}

async function createDemoUser(email: string) {
  return db.$transaction(async (tx) => {
    const user = await createUserGraph(tx, { isTest: true })
    await tx.authIdentity.create({
      data: {
        userId: user.id,
        provider: "EMAIL",
        providerSubject: email,
        emailNormalized: email,
        verifiedAt: new Date(),
      },
    })
    await tx.referralProfile.update({
      where: { userId: user.id },
      data: { isEnabled: true, enabledAt: new Date() },
    })
    return user
  })
}

async function createSubscription(userId: string, status: "ACTIVE" | "TRIAL", days: number) {
  const now = new Date()
  return db.subscription.create({
    data: {
      userId,
      status,
      startedAt: now,
      expiresAt: new Date(now.getTime() + days * 86_400_000),
      deviceLimit: 3,
      lteEnabled: false,
      planDurationMonths: status === "ACTIVE" ? 1 : null,
      syncStatus: "SYNCED",
      lastSyncedAt: now,
    },
  })
}

async function createPayment(input: {
  userId: string
  key: string
  externalId: string
  status: "CONFIRMED" | "PENDING" | "FAILED" | "REFUNDED"
  amountMinor: number
  confirmedAt?: Date
}) {
  const now = new Date()
  return db.payment.create({
    data: {
      userId: input.userId,
      provider: "test",
      externalPaymentId: input.externalId,
      idempotencyKey: input.key,
      status: input.status,
      purpose: "SUBSCRIPTION",
      amountMinor: input.amountMinor,
      currency: "RUB",
      durationDays: 30,
      deviceLimit: 3,
      lteEnabled: false,
      basePriceMinor: input.amountMinor,
      extraDevicesPriceMinor: 0,
      ltePriceMinor: 0,
      discountMinor: 0,
      priceSnapshotJson: JSON.stringify({ baseMonthlyPriceMinor: input.amountMinor }),
      pricingVersion: 4,
      providerCreatedAt: now,
      confirmedAt: input.confirmedAt,
      refundedAt: input.status === "REFUNDED" ? now : null,
      isTest: true,
    },
  })
}

async function main() {
  assertLocalDemoEnvironment()
  await initializeDatabase()
  await seedPricing()
  const admin = await bootstrapAdmin()

  const existing = await db.authIdentity.findUnique({
    where: { emailNormalized: "partner-owner@pulsar.local" },
  })
  if (existing) {
    throw new Error("Demo data already exists. Wipe prisma/dev.db before reseeding.")
  }

  const owner = await createDemoUser("partner-owner@pulsar.local")
  const alice = await createDemoUser("alice@pulsar.local")
  const bob = await createDemoUser("bob@pulsar.local")
  const carol = await createDemoUser("carol@pulsar.local")
  const disabledPartner = await createDemoUser("disabled-partner@pulsar.local")

  await db.partnerEnrollment.create({
    data: {
      userId: owner.id,
      enabled: true,
      rateBps: 4000,
      termsVersion: 1,
      enabledAt: new Date(),
    },
  })
  await db.partnerEnrollment.create({
    data: {
      userId: disabledPartner.id,
      enabled: false,
      rateBps: 2000,
      termsVersion: 1,
      disabledAt: new Date(),
    },
  })

  const ownerProfile = await db.referralProfile.findUniqueOrThrow({ where: { userId: owner.id } })
  const ownerSubscription = await createSubscription(owner.id, "ACTIVE", 45)
  await createSubscription(alice.id, "ACTIVE", 30)
  await createSubscription(bob.id, "TRIAL", 1)
  await createSubscription(carol.id, "ACTIVE", 30)

  const aliceInvite = await db.referralInvite.create({
    data: {
      inviterUserId: owner.id,
      invitedUserId: alice.id,
      inviteCodeSnapshot: ownerProfile.inviteCode,
      status: "PAID",
      convertedAt: new Date(),
    },
  })
  const bobInvite = await db.referralInvite.create({
    data: {
      inviterUserId: owner.id,
      invitedUserId: bob.id,
      inviteCodeSnapshot: ownerProfile.inviteCode,
      status: "TRIAL_GRANTED",
    },
  })
  await db.trialGrant.create({
    data: { userId: bob.id, reason: "REFERRAL", referralInviteId: bobInvite.id, days: 1 },
  })

  const alicePayment = await createPayment({
    userId: alice.id,
    key: "demo-alice-first-payment",
    externalId: "demo-alice-payment-1",
    status: "CONFIRMED",
    amountMinor: 11_900,
    confirmedAt: new Date(Date.now() - 4 * 86_400_000),
  })
  await db.referralInvite.update({
    where: { id: aliceInvite.id },
    data: { firstConfirmedPaymentId: alicePayment.id },
  })
  await db.referralSubscriptionReward.create({
    data: {
      inviteId: aliceInvite.id,
      inviterUserId: owner.id,
      invitedUserId: alice.id,
      paymentId: alicePayment.id,
      days: 10,
    },
  })

  const aliceRenewal = await createPayment({
    userId: alice.id,
    key: "demo-alice-renewal-payment",
    externalId: "demo-alice-payment-2",
    status: "CONFIRMED",
    amountMinor: 24_900,
    confirmedAt: new Date(Date.now() - 1 * 86_400_000),
  })
  const ownerEnrollment = await db.partnerEnrollment.findUniqueOrThrow({ where: { userId: owner.id } })
  for (const [payment, amount] of [
    [alicePayment, 4_760],
    [aliceRenewal, 9_960],
  ] as const) {
    await db.partnerCommission.create({
      data: {
        enrollmentId: ownerEnrollment.id,
        inviteId: aliceInvite.id,
        inviterUserId: owner.id,
        invitedUserId: alice.id,
        paymentId: payment.id,
        baseAmountMinor: payment.amountMinor,
        amountMinor: amount,
        currency: "RUB",
        rateBps: 4000,
        status: "AVAILABLE",
        createdAt: payment.confirmedAt ?? new Date(),
      },
    })
  }

  const wallet = await db.walletAccount.create({
    data: { userId: owner.id, availableMinor: 14_720, reservedMinor: 15_000, version: 2 },
  })
  for (const [payment, amount, key] of [
    [alicePayment, 4_760, "demo-owner-commission-1"],
    [aliceRenewal, 9_960, "demo-owner-commission-2"],
  ] as const) {
    await db.walletLedgerEntry.create({
      data: {
        walletAccountId: wallet.id,
        userId: owner.id,
        type: "PARTNER_COMMISSION",
        deltaAvailableMinor: amount,
        deltaReservedMinor: 0,
        referenceType: "PARTNER_COMMISSION",
        referenceId: payment.id,
        idempotencyKey: key,
        description: "Демо-комиссия за оплату приглашённого пользователя",
      },
    })
  }
  await db.walletLedgerEntry.create({
    data: {
      walletAccountId: wallet.id,
      userId: owner.id,
      type: "PARTNER_PAYOUT_RESERVE",
      deltaAvailableMinor: -15_000,
      deltaReservedMinor: 15_000,
      referenceType: "PAYOUT_REQUEST",
      referenceId: "demo-payout-request",
      idempotencyKey: "demo-owner-payout-reserve",
      description: "Демо-заявка на вывод в обработке",
    },
  })
  const payout = await db.payoutRequest.create({
    data: {
      userId: owner.id,
      idempotencyKey: "demo-owner-payout",
      amountMinor: 15_000,
      payoutDetailsEncrypted: encryptSensitive(
        JSON.stringify({ method: "CARD_OR_PHONE", recipient: "79991234567", bank: "Тиньков" })
      ),
      payoutDetailsMasked: "Реквизиты · ••••••4567 · Тиньков",
      status: "PENDING",
    },
  })
  await db.walletLedgerEntry.update({
    where: { idempotencyKey: "demo-owner-payout-reserve" },
    data: { referenceId: payout.id },
  })

  const pending = await createPayment({
    userId: bob.id,
    key: "demo-bob-pending-payment",
    externalId: "demo-bob-payment-pending",
    status: "PENDING",
    amountMinor: 11_900,
  })
  await createPayment({
    userId: carol.id,
    key: "demo-carol-refunded-payment",
    externalId: "demo-carol-payment-refunded",
    status: "REFUNDED",
    amountMinor: 11_900,
  })
  await createPayment({
    userId: bob.id,
    key: "demo-bob-failed-payment",
    externalId: "demo-bob-payment-failed",
    status: "FAILED",
    amountMinor: 11_900,
  })
  await db.subscriptionEvent.create({
    data: {
      subscriptionId: ownerSubscription.id,
      type: "DEMO_SEEDED",
      paymentId: alicePayment.id,
      actorUserId: admin.id,
      previousStateJson: JSON.stringify({ status: "TRIAL" }),
      newStateJson: JSON.stringify({ status: "ACTIVE", expiresAt: ownerSubscription.expiresAt }),
      idempotencyKey: "demo-owner-subscription-event",
    },
  })
  await db.supportConversation.create({
    data: {
      userId: owner.id,
      status: "OPEN",
      workflowState: "ANSWERED",
      channel: "WEB",
      topic: "Демо-обращение по подписке",
      lastMessageAt: new Date(),
      messages: {
        create: [
          {
            authorRole: "USER",
            senderUserId: owner.id,
            source: "WEB",
            body: "Не могу подключить второе устройство.",
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
          {
            authorRole: "ADMIN",
            senderUserId: admin.id,
            source: "ADMIN",
            body: "Проверьте приложение Happ и обновите подписку — доступ уже восстановлен.",
            createdAt: new Date(),
          },
        ],
      },
    },
  })

  console.log("Demo data seeded successfully")
  console.log("Users: partner-owner@pulsar.local, alice@pulsar.local, bob@pulsar.local, carol@pulsar.local, disabled-partner@pulsar.local")
  console.log(`Partner owner invite code: ${ownerProfile.inviteCode}`)
  console.log(`Pending payout: ${payout.id}`)
  console.log(`Pending payment: ${pending.id}`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
