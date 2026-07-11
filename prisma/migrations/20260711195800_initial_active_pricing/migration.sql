-- Pulsar cannot create quotes, referral grants, or render the pricing admin
-- without one active immutable pricing version. This inserts only the
-- operational baseline; unlike prisma/seed.ts it creates no demo users or
-- financial history.
INSERT INTO "PricingVersion" (
    "id",
    "version",
    "status",
    "currency",
    "baseMonthlyPriceRub",
    "extraDeviceMonthlyPriceRub",
    "minDeviceLimit",
    "maxDeviceLimit",
    "lteMonthlyPriceRub",
    "durationDiscounts",
    "referralFriendDiscountPct",
    "referralRewardRub",
    "minimalPayoutRub",
    "effectiveAt",
    "createdAt"
)
SELECT
    'pricing-baseline-v1',
    candidate."nextVersion",
    'ACTIVE',
    'RUB',
    119,
    50,
    1,
    5,
    50,
    '[{"months":1,"discountPct":0},{"months":3,"discountPct":10},{"months":6,"discountPct":15},{"months":12,"discountPct":30}]',
    50,
    75,
    150,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT COALESCE(MAX("version"), 0) + 1 AS "nextVersion"
    FROM "PricingVersion"
) AS candidate
WHERE NOT EXISTS (
    SELECT 1 FROM "PricingVersion" WHERE "status" = 'ACTIVE'
);
