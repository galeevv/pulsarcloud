import assert from "node:assert/strict"
import { after, before, test } from "node:test"

import { applyReferralOnboarding } from "@/src/server/services/referrals/referral-onboarding-service"
import type { TestDatabase } from "./helpers/test-database"
import {
  createPricingVersion,
  createTestDatabase,
} from "./helpers/test-database"

let database: TestDatabase

before(async () => {
  database = await createTestDatabase("referral-onboarding")
  await createPricingVersion(database.client)
})

after(async () => {
  await database.close()
})

test("referral registration atomically grants three-day trial and reward", async () => {
  const inviter = await database.client.user.create({
    data: {
      referralProfile: {
        create: {
          inviteCode: "referral-trial",
          isEnabled: true,
          enabledAt: new Date(),
        },
      },
    },
  })
  const invited = await database.client.user.create({ data: {} })

  await database.client.$transaction((tx) =>
    applyReferralOnboarding(tx, invited.id, "referral-trial")
  )
  await database.client.$transaction((tx) =>
    applyReferralOnboarding(tx, invited.id, "referral-trial")
  )

  const subscription = await database.client.subscription.findUniqueOrThrow({
    where: { userId: invited.id },
  })
  const durationMs =
    (subscription.expiresAt?.getTime() ?? 0) -
    (subscription.startsAt?.getTime() ?? 0)
  assert.equal(subscription.status, "TRIAL")
  assert.equal(durationMs, 3 * 24 * 60 * 60 * 1000)
  assert.equal(await database.client.referralInvite.count(), 1)
  assert.equal(await database.client.referralReward.count(), 1)
  assert.equal(await database.client.subscriptionPeriod.count(), 1)
  assert.equal(await database.client.job.count(), 1)
  assert.equal(
    (
      await database.client.user.findUniqueOrThrow({
        where: { id: inviter.id },
      })
    ).balanceRub,
    75
  )
})
