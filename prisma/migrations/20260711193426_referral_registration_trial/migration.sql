-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReferralReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviteId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "paymentId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'FIRST_PAYMENT',
    "amountRub" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "availableAt" DATETIME,
    "reservedAt" DATETIME,
    "paidAt" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralReward_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ReferralInvite" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralReward_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralReward_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralReward_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralReward_amount_positive" CHECK ("amountRub" > 0),
    CONSTRAINT "ReferralReward_source_valid" CHECK (
      ("kind" = 'REGISTRATION' AND "paymentId" IS NULL) OR
      ("kind" = 'FIRST_PAYMENT' AND "paymentId" IS NOT NULL)
    )
);
INSERT INTO "new_ReferralReward" ("amountRub", "availableAt", "canceledAt", "createdAt", "id", "inviteId", "invitedUserId", "inviterId", "paidAt", "paymentId", "reservedAt", "status") SELECT "amountRub", "availableAt", "canceledAt", "createdAt", "id", "inviteId", "invitedUserId", "inviterId", "paidAt", "paymentId", "reservedAt", "status" FROM "ReferralReward";
DROP TABLE "ReferralReward";
ALTER TABLE "new_ReferralReward" RENAME TO "ReferralReward";
CREATE UNIQUE INDEX "ReferralReward_inviteId_key" ON "ReferralReward"("inviteId");
CREATE UNIQUE INDEX "ReferralReward_paymentId_key" ON "ReferralReward"("paymentId");
CREATE INDEX "ReferralReward_inviterId_status_idx" ON "ReferralReward"("inviterId", "status");
CREATE INDEX "ReferralReward_invitedUserId_idx" ON "ReferralReward"("invitedUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
