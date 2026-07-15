-- Device-limit upgrades are independent purchases and must not extend the
-- subscription term when their payment is confirmed.
ALTER TABLE "Payment"
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'SUBSCRIPTION';

-- A device added to an already active subscription costs 50 RUB once. This is
-- deliberately separate from the 15 RUB monthly extra-device tariff used for
-- a new subscription purchase.
ALTER TABLE "PricingSettings"
ADD COLUMN "deviceLimitUpgradePriceMinor" INTEGER NOT NULL DEFAULT 5000;

UPDATE "PricingSettings"
SET "version" = "version" + 1
WHERE "key" = 'default';
