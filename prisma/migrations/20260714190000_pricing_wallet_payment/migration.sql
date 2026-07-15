-- Store the discount granted to an invited friend on their first payment.
ALTER TABLE "PricingSettings"
ADD COLUMN "referralFriendDiscountPct" INTEGER NOT NULL DEFAULT 50;

-- Align the active catalog with Pulsar 2.0 pricing. Historical Payment
-- snapshots remain immutable and continue to reference their original version.
UPDATE "PricingSettings"
SET "baseMonthlyPriceMinor" = 11900,
    "extraDeviceMonthlyPriceMinor" = 1500,
    "lteMonthlyPriceMinor" = 5000,
    "durationDiscountsJson" = '{"1":0,"3":10,"6":15,"12":30}',
    "minDeviceLimit" = 1,
    "maxDeviceLimit" = 5,
    "referralRewardMinor" = 7500,
    "referralFriendDiscountPct" = 50,
    "minimalPayoutMinor" = 15000,
    "version" = "version" + 1;
