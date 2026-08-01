ALTER TABLE "PricingSettings" ADD COLUMN "referralRewardDays" INTEGER NOT NULL DEFAULT 10;

UPDATE "PricingSettings" SET "referralTrialDays" = 1;

CREATE TABLE "ReferralSubscriptionReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviteId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralSubscriptionReward_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ReferralInvite" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralSubscriptionReward_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralSubscriptionReward_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralSubscriptionReward_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReferralSubscriptionReward_inviteId_key" ON "ReferralSubscriptionReward"("inviteId");
CREATE UNIQUE INDEX "ReferralSubscriptionReward_paymentId_key" ON "ReferralSubscriptionReward"("paymentId");
CREATE INDEX "ReferralSubscriptionReward_inviterUserId_createdAt_idx" ON "ReferralSubscriptionReward"("inviterUserId", "createdAt");
