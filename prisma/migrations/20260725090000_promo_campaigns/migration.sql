-- Launch promotions are independent from tariff pricing and referral trials.
-- Every claim stores an immutable entitlement snapshot, while claimedCount is
-- updated in the same transaction as the claim and subscription desired state.
CREATE TABLE "PromoCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "claimLimit" INTEGER NOT NULL,
    "claimedCount" INTEGER NOT NULL DEFAULT 0,
    "registrationWindowDays" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "deviceLimit" INTEGER NOT NULL,
    "lteEnabled" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromoCampaign_createdByAdminId_fkey"
      FOREIGN KEY ("createdByAdminId") REFERENCES "User" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PromoCampaign_claimLimit_check"
      CHECK ("claimLimit" > 0),
    CONSTRAINT "PromoCampaign_claimedCount_check"
      CHECK ("claimedCount" >= 0 AND "claimedCount" <= "claimLimit"),
    CONSTRAINT "PromoCampaign_registrationWindowDays_check"
      CHECK ("registrationWindowDays" BETWEEN 1 AND 365),
    CONSTRAINT "PromoCampaign_durationDays_check"
      CHECK ("durationDays" BETWEEN 1 AND 365),
    CONSTRAINT "PromoCampaign_deviceLimit_check"
      CHECK ("deviceLimit" BETWEEN 1 AND 5)
);

CREATE TABLE "PromoClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimNumber" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "deviceLimit" INTEGER NOT NULL,
    "lteEnabled" BOOLEAN NOT NULL,
    "entitlementExpiresAt" DATETIME NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoClaim_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "PromoCampaign" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PromoClaim_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromoClaim_claimNumber_check"
      CHECK ("claimNumber" > 0),
    CONSTRAINT "PromoClaim_durationDays_check"
      CHECK ("durationDays" BETWEEN 1 AND 365),
    CONSTRAINT "PromoClaim_deviceLimit_check"
      CHECK ("deviceLimit" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "PromoCampaign_slug_isTest_key"
ON "PromoCampaign"("slug", "isTest");

CREATE UNIQUE INDEX "PromoCampaign_one_active_per_namespace"
ON "PromoCampaign"("isTest")
WHERE "status" = 'ACTIVE';

CREATE INDEX "PromoCampaign_isTest_status_startsAt_endsAt_idx"
ON "PromoCampaign"("isTest", "status", "startsAt", "endsAt");

CREATE INDEX "PromoCampaign_createdAt_idx"
ON "PromoCampaign"("createdAt");

CREATE UNIQUE INDEX "PromoClaim_campaignId_userId_key"
ON "PromoClaim"("campaignId", "userId");

CREATE UNIQUE INDEX "PromoClaim_campaignId_claimNumber_key"
ON "PromoClaim"("campaignId", "claimNumber");

CREATE INDEX "PromoClaim_campaignId_grantedAt_idx"
ON "PromoClaim"("campaignId", "grantedAt");

CREATE INDEX "PromoClaim_userId_idx"
ON "PromoClaim"("userId");
