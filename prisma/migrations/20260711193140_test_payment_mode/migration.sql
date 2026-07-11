-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "amountRub" INTEGER NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "deviceLimit" INTEGER NOT NULL,
    "lteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "externalPaymentId" TEXT,
    "checkoutUrl" TEXT,
    "metadata" JSONB,
    "refundedAmountRub" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" DATETIME,
    "refundedAt" DATETIME,
    "canceledAt" DATETIME,
    "failedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "PriceQuote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_values_valid" CHECK ("amountRub" >= 0 AND "durationMonths" > 0 AND "deviceLimit" > 0),
    CONSTRAINT "Payment_test_provider_valid" CHECK (("isTest" = 1 AND "provider" = 'TEST') OR ("isTest" = 0 AND "provider" <> 'TEST'))
);
INSERT INTO "new_Payment" ("amountRub", "canceledAt", "checkoutUrl", "confirmedAt", "createdAt", "currency", "deviceLimit", "durationMonths", "externalPaymentId", "failedAt", "id", "idempotencyKey", "lteEnabled", "metadata", "provider", "quoteId", "refundedAmountRub", "refundedAt", "status", "updatedAt", "userId") SELECT "amountRub", "canceledAt", "checkoutUrl", "confirmedAt", "createdAt", "currency", "deviceLimit", "durationMonths", "externalPaymentId", "failedAt", "id", "idempotencyKey", "lteEnabled", "metadata", "provider", "quoteId", "refundedAmountRub", "refundedAt", "status", "updatedAt", "userId" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_quoteId_key" ON "Payment"("quoteId");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE INDEX "Payment_isTest_status_createdAt_idx" ON "Payment"("isTest", "status", "createdAt");
CREATE UNIQUE INDEX "Payment_provider_externalPaymentId_key" ON "Payment"("provider", "externalPaymentId");
CREATE TABLE "new_PaymentWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "paymentId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" DATETIME,
    "lastError" TEXT,
    "verifiedAt" DATETIME,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentWebhookEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PaymentWebhookEvent" ("attemptCount", "eventType", "id", "lastError", "payload", "payloadHash", "paymentId", "processedAt", "provider", "providerEventId", "receivedAt", "status", "verifiedAt") SELECT "attemptCount", "eventType", "id", "lastError", "payload", "payloadHash", "paymentId", "processedAt", "provider", "providerEventId", "receivedAt", "status", "verifiedAt" FROM "PaymentWebhookEvent";
DROP TABLE "PaymentWebhookEvent";
ALTER TABLE "new_PaymentWebhookEvent" RENAME TO "PaymentWebhookEvent";
CREATE INDEX "PaymentWebhookEvent_paymentId_idx" ON "PaymentWebhookEvent"("paymentId");
CREATE INDEX "PaymentWebhookEvent_status_receivedAt_idx" ON "PaymentWebhookEvent"("status", "receivedAt");
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_payloadHash_key" ON "PaymentWebhookEvent"("provider", "payloadHash");
CREATE TABLE "new_SubscriptionPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "paymentId" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "deviceLimit" INTEGER NOT NULL,
    "lteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "amountRub" INTEGER NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionPeriod_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionPeriod_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionPeriod_values_valid" CHECK ("endsAt" > "startsAt" AND "deviceLimit" > 0 AND "amountRub" >= 0)
);
INSERT INTO "new_SubscriptionPeriod" ("amountRub", "createdAt", "deviceLimit", "endsAt", "id", "lteEnabled", "paymentId", "startsAt", "subscriptionId") SELECT "amountRub", "createdAt", "deviceLimit", "endsAt", "id", "lteEnabled", "paymentId", "startsAt", "subscriptionId" FROM "SubscriptionPeriod";
DROP TABLE "SubscriptionPeriod";
ALTER TABLE "new_SubscriptionPeriod" RENAME TO "SubscriptionPeriod";
CREATE UNIQUE INDEX "SubscriptionPeriod_paymentId_key" ON "SubscriptionPeriod"("paymentId");
CREATE INDEX "SubscriptionPeriod_subscriptionId_startsAt_idx" ON "SubscriptionPeriod"("subscriptionId", "startsAt");
CREATE INDEX "SubscriptionPeriod_endsAt_idx" ON "SubscriptionPeriod"("endsAt");
CREATE TABLE "new_WalletLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountRub" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "paymentId" TEXT,
    "payoutRequestId" TEXT,
    "referralRewardId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" DATETIME,
    "voidedAt" DATETIME,
    CONSTRAINT "WalletLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WalletLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WalletLedgerEntry_payoutRequestId_fkey" FOREIGN KEY ("payoutRequestId") REFERENCES "PayoutRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WalletLedgerEntry_referralRewardId_fkey" FOREIGN KEY ("referralRewardId") REFERENCES "ReferralReward" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WalletLedgerEntry_amount_positive" CHECK ("amountRub" > 0)
);
INSERT INTO "new_WalletLedgerEntry" ("amountRub", "createdAt", "currency", "direction", "id", "idempotencyKey", "metadata", "paymentId", "payoutRequestId", "postedAt", "referralRewardId", "status", "type", "userId", "voidedAt") SELECT "amountRub", "createdAt", "currency", "direction", "id", "idempotencyKey", "metadata", "paymentId", "payoutRequestId", "postedAt", "referralRewardId", "status", "type", "userId", "voidedAt" FROM "WalletLedgerEntry";
DROP TABLE "WalletLedgerEntry";
ALTER TABLE "new_WalletLedgerEntry" RENAME TO "WalletLedgerEntry";
CREATE UNIQUE INDEX "WalletLedgerEntry_idempotencyKey_key" ON "WalletLedgerEntry"("idempotencyKey");
CREATE UNIQUE INDEX "WalletLedgerEntry_referralRewardId_key" ON "WalletLedgerEntry"("referralRewardId");
CREATE INDEX "WalletLedgerEntry_userId_createdAt_idx" ON "WalletLedgerEntry"("userId", "createdAt");
CREATE INDEX "WalletLedgerEntry_paymentId_idx" ON "WalletLedgerEntry"("paymentId");
CREATE INDEX "WalletLedgerEntry_payoutRequestId_idx" ON "WalletLedgerEntry"("payoutRequestId");
CREATE INDEX "WalletLedgerEntry_status_createdAt_idx" ON "WalletLedgerEntry"("status", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Prisma rebuilds SQLite tables when columns are added. Recreate the manual
-- constraints and immutability triggers that belong to those tables.
CREATE TRIGGER "SubscriptionPeriod_immutable"
BEFORE UPDATE ON "SubscriptionPeriod"
BEGIN
  SELECT RAISE(ABORT, 'SubscriptionPeriod is immutable');
END;

CREATE TRIGGER "Payment_immutable_terms"
BEFORE UPDATE OF
  "userId", "quoteId", "provider", "isTest", "currency", "amountRub",
  "durationMonths", "deviceLimit", "lteEnabled", "idempotencyKey"
ON "Payment"
BEGIN
  SELECT RAISE(ABORT, 'Payment commercial terms are immutable');
END;

CREATE TRIGGER "Payment_status_insert"
BEFORE INSERT ON "Payment"
WHEN NEW."status" NOT IN (
  'CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED',
  'REFUNDED', 'PARTIALLY_REFUNDED'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid Payment status');
END;

CREATE TRIGGER "Payment_status_update"
BEFORE UPDATE OF "status" ON "Payment"
WHEN NEW."status" NOT IN (
  'CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED',
  'REFUNDED', 'PARTIALLY_REFUNDED'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid Payment status');
END;

CREATE TRIGGER "Payment_refundedAmount_insert"
BEFORE INSERT ON "Payment"
WHEN NEW."refundedAmountRub" < 0 OR NEW."refundedAmountRub" > NEW."amountRub"
BEGIN
  SELECT RAISE(ABORT, 'invalid refundedAmountRub');
END;

CREATE TRIGGER "Payment_refundedAmount_update"
BEFORE UPDATE OF "refundedAmountRub", "amountRub" ON "Payment"
WHEN NEW."refundedAmountRub" < 0 OR NEW."refundedAmountRub" > NEW."amountRub"
BEGIN
  SELECT RAISE(ABORT, 'invalid refundedAmountRub');
END;
