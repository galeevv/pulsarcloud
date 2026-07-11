-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "balanceRub" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_balanceRub_nonnegative" CHECK ("balanceRub" >= 0)
);

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "context" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuthChallenge_attempts_valid" CHECK ("attemptCount" >= 0 AND "maxAttempts" > 0 AND "attemptCount" <= "maxAttempts")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PricingVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "baseMonthlyPriceRub" INTEGER NOT NULL,
    "extraDeviceMonthlyPriceRub" INTEGER NOT NULL,
    "minDeviceLimit" INTEGER NOT NULL DEFAULT 1,
    "maxDeviceLimit" INTEGER NOT NULL DEFAULT 5,
    "lteMonthlyPriceRub" INTEGER NOT NULL,
    "durationDiscounts" JSONB NOT NULL,
    "referralFriendDiscountPct" INTEGER NOT NULL DEFAULT 0,
    "referralRewardRub" INTEGER NOT NULL,
    "minimalPayoutRub" INTEGER NOT NULL,
    "effectiveAt" DATETIME,
    "retiredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PricingVersion_prices_valid" CHECK (
        "baseMonthlyPriceRub" > 0 AND
        "extraDeviceMonthlyPriceRub" >= 0 AND
        "lteMonthlyPriceRub" >= 0 AND
        "minDeviceLimit" > 0 AND
        "maxDeviceLimit" >= "minDeviceLimit" AND
        "referralFriendDiscountPct" BETWEEN 0 AND 100 AND
        "referralRewardRub" >= 0 AND
        "minimalPayoutRub" > 0
    )
);

-- CreateTable
CREATE TABLE "PriceQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "pricingVersionId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "durationMonths" INTEGER NOT NULL,
    "deviceLimit" INTEGER NOT NULL,
    "lteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "referralDiscountPct" INTEGER NOT NULL DEFAULT 0,
    "subtotalRub" INTEGER NOT NULL,
    "discountRub" INTEGER NOT NULL,
    "totalRub" INTEGER NOT NULL,
    "pricingSnapshot" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceQuote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PriceQuote_pricingVersionId_fkey" FOREIGN KEY ("pricingVersionId") REFERENCES "PricingVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PriceQuote_values_valid" CHECK (
        "durationMonths" > 0 AND "deviceLimit" > 0 AND
        "subtotalRub" >= 0 AND "discountRub" >= 0 AND "totalRub" >= 0 AND
        "totalRub" = "subtotalRub" - "discountRub"
    )
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
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
    "confirmedAt" DATETIME,
    "canceledAt" DATETIME,
    "failedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "PriceQuote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_values_valid" CHECK ("amountRub" >= 0 AND "durationMonths" > 0 AND "deviceLimit" > 0)
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "paymentId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" DATETIME,
    "lastError" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentWebhookEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NONE',
    "startsAt" DATETIME,
    "expiresAt" DATETIME,
    "deviceLimit" INTEGER NOT NULL DEFAULT 1,
    "lteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionUrl" TEXT,
    "remnawaveUserId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'NOT_SYNCED',
    "lastUserFriendlyError" TEXT,
    "lastTechnicalError" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_deviceLimit_valid" CHECK ("deviceLimit" > 0 AND "version" >= 0)
);

-- CreateTable
CREATE TABLE "SubscriptionPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "paymentId" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "deviceLimit" INTEGER NOT NULL,
    "lteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "amountRub" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionPeriod_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionPeriod_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionPeriod_values_valid" CHECK ("endsAt" > "startsAt" AND "deviceLimit" > 0 AND "amountRub" >= 0)
);

-- CreateTable
CREATE TABLE "ReferralProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "inviteCode" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReferralProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferralInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviterId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "inviteCodeSnapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" DATETIME,
    "canceledAt" DATETIME,
    CONSTRAINT "ReferralInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviteId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
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
    CONSTRAINT "ReferralReward_amount_positive" CHECK ("amountRub" > 0)
);

-- CreateTable
CREATE TABLE "WalletLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountRub" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
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

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amountRub" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutDetails" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "adminNote" TEXT,
    "approvedById" TEXT,
    "paidById" TEXT,
    "rejectedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "paidAt" DATETIME,
    "rejectedAt" DATETIME,
    "canceledAt" DATETIME,
    CONSTRAINT "PayoutRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_amount_positive" CHECK ("amountRub" > 0)
);

-- CreateTable
CREATE TABLE "SupportConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "subject" TEXT,
    "lastMessageAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "updateId" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "lastError" TEXT
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "lastError" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_attempts_valid" CHECK ("attemptCount" >= 0 AND "maxAttempts" > 0 AND "attemptCount" <= "maxAttempts")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "idempotencyKey" TEXT,
    "data" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "capacity" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Node_capacity_positive" CHECK ("capacity" > 0)
);

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_providerSubject_key" ON "AuthIdentity"("provider", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key" ON "AuthIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_tokenHash_key" ON "AuthChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthChallenge_provider_providerSubject_status_createdAt_idx" ON "AuthChallenge"("provider", "providerSubject", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_status_expiresAt_idx" ON "AuthChallenge"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_userId_idx" ON "AuthChallenge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PricingVersion_version_key" ON "PricingVersion"("version");

-- CreateIndex
CREATE INDEX "PricingVersion_status_effectiveAt_idx" ON "PricingVersion"("status", "effectiveAt");

-- SQLite partial indexes enforce singleton state that Prisma schema cannot express.
CREATE UNIQUE INDEX "PricingVersion_one_active_key" ON "PricingVersion"("status") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "PriceQuote_idempotencyKey_key" ON "PriceQuote"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PriceQuote_userId_createdAt_idx" ON "PriceQuote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceQuote_expiresAt_idx" ON "PriceQuote"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_quoteId_key" ON "Payment"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_externalPaymentId_key" ON "Payment"("provider", "externalPaymentId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_paymentId_idx" ON "PaymentWebhookEvent"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_status_receivedAt_idx" ON "PaymentWebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_payloadHash_key" ON "PaymentWebhookEvent"("provider", "payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_remnawaveUserId_key" ON "Subscription"("remnawaveUserId");

-- CreateIndex
CREATE INDEX "Subscription_status_expiresAt_idx" ON "Subscription"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Subscription_syncStatus_updatedAt_idx" ON "Subscription"("syncStatus", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPeriod_paymentId_key" ON "SubscriptionPeriod"("paymentId");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_subscriptionId_startsAt_idx" ON "SubscriptionPeriod"("subscriptionId", "startsAt");

-- CreateIndex
CREATE INDEX "SubscriptionPeriod_endsAt_idx" ON "SubscriptionPeriod"("endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProfile_inviteCode_key" ON "ReferralProfile"("inviteCode");

-- CreateIndex
CREATE INDEX "ReferralProfile_isEnabled_idx" ON "ReferralProfile"("isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralInvite_invitedUserId_key" ON "ReferralInvite"("invitedUserId");

-- CreateIndex
CREATE INDEX "ReferralInvite_inviterId_status_idx" ON "ReferralInvite"("inviterId", "status");

-- CreateIndex
CREATE INDEX "ReferralInvite_status_createdAt_idx" ON "ReferralInvite"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_inviteId_key" ON "ReferralReward"("inviteId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_paymentId_key" ON "ReferralReward"("paymentId");

-- CreateIndex
CREATE INDEX "ReferralReward_inviterId_status_idx" ON "ReferralReward"("inviterId", "status");

-- CreateIndex
CREATE INDEX "ReferralReward_invitedUserId_idx" ON "ReferralReward"("invitedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedgerEntry_idempotencyKey_key" ON "WalletLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedgerEntry_referralRewardId_key" ON "WalletLedgerEntry"("referralRewardId");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_userId_createdAt_idx" ON "WalletLedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_paymentId_idx" ON "WalletLedgerEntry"("paymentId");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_payoutRequestId_idx" ON "WalletLedgerEntry"("payoutRequestId");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_status_createdAt_idx" ON "WalletLedgerEntry"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRequest_idempotencyKey_key" ON "PayoutRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PayoutRequest_userId_createdAt_idx" ON "PayoutRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutRequest_status_createdAt_idx" ON "PayoutRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportConversation_userId_status_updatedAt_idx" ON "SupportConversation"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportConversation_status_lastMessageAt_idx" ON "SupportConversation"("status", "lastMessageAt");

CREATE UNIQUE INDEX "SupportConversation_one_open_per_user_key" ON "SupportConversation"("userId") WHERE "status" = 'OPEN';

-- CreateIndex
CREATE UNIQUE INDEX "SupportMessage_idempotencyKey_key" ON "SupportMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SupportMessage_conversationId_createdAt_idx" ON "SupportMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_senderId_idx" ON "SupportMessage"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUpdate_updateId_key" ON "TelegramUpdate"("updateId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUpdate_payloadHash_key" ON "TelegramUpdate"("payloadHash");

-- CreateIndex
CREATE INDEX "TelegramUpdate_status_receivedAt_idx" ON "TelegramUpdate"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_lockedAt_idx" ON "Job"("lockedAt");

-- CreateIndex
CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_idempotencyKey_key" ON "AuditEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_createdAt_idx" ON "AuditEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Node_domain_key" ON "Node"("domain");

-- CreateIndex
CREATE INDEX "Node_type_status_idx" ON "Node"("type", "status");

-- CreateIndex
CREATE INDEX "Node_sortOrder_idx" ON "Node"("sortOrder");
