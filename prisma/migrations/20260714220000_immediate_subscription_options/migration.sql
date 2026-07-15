UPDATE "PricingSettings"
SET
    "referralFriendDiscountPct" = 0,
    "version" = "version" + 1
WHERE "key" = 'default' AND "referralFriendDiscountPct" <> 0;

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
WHERE
    "nextDeviceLimit" IS NOT NULL
    OR "nextLteEnabled" IS NOT NULL
    OR "nextParametersAt" IS NOT NULL;

UPDATE "Subscription"
SET
    "deviceLimit" = COALESCE("nextDeviceLimit", "deviceLimit"),
    "lteEnabled" = COALESCE("nextLteEnabled", "lteEnabled"),
    "nextDeviceLimit" = NULL,
    "nextLteEnabled" = NULL,
    "nextParametersAt" = NULL,
    "syncStatus" = 'PENDING',
    "syncVersion" = "syncVersion" + 1,
    "lastTechnicalError" = NULL,
    "lastUserFriendlyError" = NULL
WHERE
    "nextDeviceLimit" IS NOT NULL
    OR "nextLteEnabled" IS NOT NULL
    OR "nextParametersAt" IS NOT NULL;
