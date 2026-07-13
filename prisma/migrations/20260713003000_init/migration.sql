-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastLoginAt" DATETIME
);

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "emailNormalized" TEXT,
    "telegramId" TEXT,
    "telegramUsername" TEXT,
    "verifiedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "emailNormalized" TEXT,
    "telegramId" TEXT,
    "requestedByUserId" TEXT,
    "otpHash" TEXT,
    "magicLinkTokenHash" TEXT,
    "telegramStartTokenHash" TEXT,
    "completionTokenHash" TEXT,
    "inviteCodeSnapshot" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "requestedIpHash" TEXT,
    "userAgentHash" TEXT,
    "devOtpEncrypted" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginChallenge_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" DATETIME NOT NULL,
    "absoluteExpiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "userAgentHash" TEXT,
    "ipPrefixHash" TEXT,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PricingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL DEFAULT 'default',
    "baseMonthlyPriceMinor" INTEGER NOT NULL,
    "extraDeviceMonthlyPriceMinor" INTEGER NOT NULL,
    "lteMonthlyPriceMinor" INTEGER NOT NULL,
    "durationDiscountsJson" TEXT NOT NULL,
    "minDeviceLimit" INTEGER NOT NULL DEFAULT 1,
    "maxDeviceLimit" INTEGER NOT NULL DEFAULT 5,
    "referralRewardMinor" INTEGER NOT NULL DEFAULT 7500,
    "referralTrialDays" INTEGER NOT NULL DEFAULT 3,
    "minimalPayoutMinor" INTEGER NOT NULL DEFAULT 15000,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalPaymentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "durationDays" INTEGER NOT NULL,
    "deviceLimit" INTEGER NOT NULL,
    "lteEnabled" BOOLEAN NOT NULL,
    "basePriceMinor" INTEGER NOT NULL,
    "extraDevicesPriceMinor" INTEGER NOT NULL,
    "ltePriceMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL,
    "priceSnapshotJson" TEXT NOT NULL,
    "pricingVersion" INTEGER NOT NULL,
    "checkoutUrl" TEXT,
    "providerCreatedAt" DATETIME,
    "confirmedAt" DATETIME,
    "refundedAt" DATETIME,
    "expiresAt" DATETIME,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentWebhookLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalPaymentId" TEXT,
    "paymentId" TEXT,
    "signatureValid" BOOLEAN NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "processingError" TEXT,
    CONSTRAINT "PaymentWebhookLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "deviceLimit" INTEGER NOT NULL,
    "lteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "nextDeviceLimit" INTEGER,
    "nextLteEnabled" BOOLEAN,
    "subscriptionUrl" TEXT,
    "remnawaveUserId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "lastSyncedAt" DATETIME,
    "lastUserFriendlyError" TEXT,
    "lastTechnicalError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "paymentId" TEXT,
    "actorUserId" TEXT,
    "previousStateJson" TEXT,
    "newStateJson" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SubscriptionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrialGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "referralInviteId" TEXT,
    "days" INTEGER NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrialGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrialGrant_referralInviteId_fkey" FOREIGN KEY ("referralInviteId") REFERENCES "ReferralInvite" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferralProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferralInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviterUserId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "inviteCodeSnapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "firstConfirmedPaymentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" DATETIME,
    CONSTRAINT "ReferralInvite_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviteId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" DATETIME,
    CONSTRAINT "ReferralReward_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ReferralInvite" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralReward_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralReward_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralReward_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "availableMinor" INTEGER NOT NULL DEFAULT 0,
    "reservedMinor" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WalletLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deltaAvailableMinor" INTEGER NOT NULL,
    "deltaReservedMinor" INTEGER NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletLedgerEntry_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "WalletAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "payoutDetailsEncrypted" TEXT NOT NULL,
    "payoutDetailsMasked" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" TEXT,
    "reviewedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayoutRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayoutRequest_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupportConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "senderUserId" TEXT,
    "source" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupportMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelegramProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "chatId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "canReceiveMessages" BOOLEAN NOT NULL DEFAULT true,
    "transactionalNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "newsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "botStartedAt" DATETIME,
    "botBlockedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelegramProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelegramUpdateLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "updateId" TEXT NOT NULL,
    "updateType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "processingError" TEXT
);

-- CreateTable
CREATE TABLE "TelegramBroadcast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdByAdminId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "target" TEXT NOT NULL,
    "queuedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramBroadcast_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelegramBroadcastDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "broadcastId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "telegramMessageId" TEXT,
    "error" TEXT,
    "sentAt" DATETIME,
    CONSTRAINT "TelegramBroadcastDelivery_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "TelegramBroadcast" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TelegramBroadcastDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutboxJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadataJson" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "integration" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "success" BOOLEAN NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "requestSummary" TEXT,
    "responseSummary" TEXT,
    "technicalError" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SystemState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_status_role_idx" ON "User"("status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_emailNormalized_key" ON "AuthIdentity"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_telegramId_key" ON "AuthIdentity"("telegramId");

-- CreateIndex
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_providerSubject_key" ON "AuthIdentity"("provider", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key" ON "AuthIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "LoginChallenge_magicLinkTokenHash_key" ON "LoginChallenge"("magicLinkTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "LoginChallenge_telegramStartTokenHash_key" ON "LoginChallenge"("telegramStartTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "LoginChallenge_completionTokenHash_key" ON "LoginChallenge"("completionTokenHash");

-- CreateIndex
CREATE INDEX "LoginChallenge_emailNormalized_createdAt_idx" ON "LoginChallenge"("emailNormalized", "createdAt");

-- CreateIndex
CREATE INDEX "LoginChallenge_requestedIpHash_createdAt_idx" ON "LoginChallenge"("requestedIpHash", "createdAt");

-- CreateIndex
CREATE INDEX "LoginChallenge_status_expiresAt_idx" ON "LoginChallenge"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_kind_revokedAt_idx" ON "Session"("userId", "kind", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_idleExpiresAt_absoluteExpiresAt_idx" ON "Session"("idleExpiresAt", "absoluteExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PricingSettings_key_key" ON "PricingSettings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalPaymentId_key" ON "Payment"("externalPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentWebhookLog_externalPaymentId_idx" ON "PaymentWebhookLog"("externalPaymentId");

-- CreateIndex
CREATE INDEX "PaymentWebhookLog_processedAt_idx" ON "PaymentWebhookLog"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookLog_provider_eventId_key" ON "PaymentWebhookLog"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_remnawaveUserId_key" ON "Subscription"("remnawaveUserId");

-- CreateIndex
CREATE INDEX "Subscription_status_expiresAt_idx" ON "Subscription"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Subscription_syncStatus_updatedAt_idx" ON "Subscription"("syncStatus", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionEvent_idempotencyKey_key" ON "SubscriptionEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_paymentId_idx" ON "SubscriptionEvent"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "TrialGrant_userId_key" ON "TrialGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrialGrant_referralInviteId_key" ON "TrialGrant"("referralInviteId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProfile_userId_key" ON "ReferralProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProfile_inviteCode_key" ON "ReferralProfile"("inviteCode");

-- CreateIndex
CREATE INDEX "ReferralProfile_isEnabled_inviteCode_idx" ON "ReferralProfile"("isEnabled", "inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralInvite_invitedUserId_key" ON "ReferralInvite"("invitedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralInvite_firstConfirmedPaymentId_key" ON "ReferralInvite"("firstConfirmedPaymentId");

-- CreateIndex
CREATE INDEX "ReferralInvite_inviterUserId_createdAt_idx" ON "ReferralInvite"("inviterUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_inviteId_key" ON "ReferralReward"("inviteId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_paymentId_key" ON "ReferralReward"("paymentId");

-- CreateIndex
CREATE INDEX "ReferralReward_inviterUserId_status_idx" ON "ReferralReward"("inviterUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_userId_key" ON "WalletAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedgerEntry_idempotencyKey_key" ON "WalletLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_userId_createdAt_idx" ON "WalletLedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_referenceType_referenceId_idx" ON "WalletLedgerEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRequest_idempotencyKey_key" ON "PayoutRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PayoutRequest_status_createdAt_idx" ON "PayoutRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutRequest_userId_createdAt_idx" ON "PayoutRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportConversation_userId_key" ON "SupportConversation"("userId");

-- CreateIndex
CREATE INDEX "SupportConversation_status_lastMessageAt_idx" ON "SupportConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SupportMessage_conversationId_createdAt_idx" ON "SupportMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramProfile_userId_key" ON "TelegramProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramProfile_telegramId_key" ON "TelegramProfile"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUpdateLog_updateId_key" ON "TelegramUpdateLog"("updateId");

-- CreateIndex
CREATE INDEX "TelegramUpdateLog_processedAt_receivedAt_idx" ON "TelegramUpdateLog"("processedAt", "receivedAt");

-- CreateIndex
CREATE INDEX "TelegramBroadcast_status_createdAt_idx" ON "TelegramBroadcast"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramBroadcastDelivery_broadcastId_status_idx" ON "TelegramBroadcastDelivery"("broadcastId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBroadcastDelivery_broadcastId_userId_key" ON "TelegramBroadcastDelivery"("broadcastId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxJob_dedupeKey_key" ON "OutboxJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxJob_status_runAfter_idx" ON "OutboxJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "OutboxJob_lockedAt_idx" ON "OutboxJob"("lockedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationLog_integration_createdAt_idx" ON "IntegrationLog"("integration", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationLog_entityType_entityId_createdAt_idx" ON "IntegrationLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_windowStart_key" ON "RateLimitBucket"("key", "windowStart");
