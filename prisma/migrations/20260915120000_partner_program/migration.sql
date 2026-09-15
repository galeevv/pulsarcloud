CREATE TABLE "PartnerEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rateBps" INTEGER NOT NULL DEFAULT 4000,
    "termsVersion" INTEGER NOT NULL DEFAULT 1,
    "enabledAt" DATETIME,
    "disabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartnerEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PartnerEnrollment_userId_key" ON "PartnerEnrollment"("userId");
CREATE INDEX "PartnerEnrollment_enabled_updatedAt_idx" ON "PartnerEnrollment"("enabled", "updatedAt");

CREATE TABLE "PartnerCommission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "baseAmountMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "rateBps" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "reversedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerCommission_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "PartnerEnrollment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartnerCommission_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ReferralInvite" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartnerCommission_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartnerCommission_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartnerCommission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PartnerCommission_paymentId_key" ON "PartnerCommission"("paymentId");
CREATE INDEX "PartnerCommission_inviterUserId_status_createdAt_idx" ON "PartnerCommission"("inviterUserId", "status", "createdAt");
CREATE INDEX "PartnerCommission_invitedUserId_createdAt_idx" ON "PartnerCommission"("invitedUserId", "createdAt");
