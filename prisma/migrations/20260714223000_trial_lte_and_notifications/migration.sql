INSERT OR IGNORE INTO "OutboxJob" (
    "id",
    "type",
    "aggregateType",
    "aggregateId",
    "payloadJson",
    "dedupeKey",
    "status",
    "attempts",
    "maxAttempts",
    "runAfter",
    "createdAt"
)
SELECT
    lower(hex(randomblob(16))),
    'PROVISION_SUBSCRIPTION',
    'Subscription',
    "id",
    '{"subscriptionId":"' || "id" || '","syncVersion":' || ("syncVersion" + 1) || '}',
    'subscription:' || "id" || ':sync:' || ("syncVersion" + 1),
    'PENDING',
    0,
    8,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Subscription"
WHERE "status" = 'TRIAL' AND "lteEnabled" = 0;

UPDATE "Subscription"
SET
    "lteEnabled" = 1,
    "syncStatus" = 'PENDING',
    "syncVersion" = "syncVersion" + 1,
    "lastTechnicalError" = NULL,
    "lastUserFriendlyError" = NULL
WHERE "status" = 'TRIAL' AND "lteEnabled" = 0;

UPDATE "TelegramProfile"
SET
    "transactionalNotificationsEnabled" = 1,
    "newsNotificationsEnabled" = 1;
