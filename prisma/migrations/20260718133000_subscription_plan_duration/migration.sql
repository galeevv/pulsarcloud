-- The canonical subscription keeps the duration selected in its latest paid
-- purchase. This is reporting metadata only: Payment snapshots remain the
-- authority for the price and term that were already paid.
ALTER TABLE "Subscription"
ADD COLUMN "planDurationMonths" INTEGER;

-- Historic payments already store immutable duration days. Backfill only the
-- four supported paid terms and leave trials/admin-created subscriptions null.
UPDATE "Subscription"
SET "planDurationMonths" = (
  SELECT CASE "Payment"."durationDays"
    WHEN 30 THEN 1
    WHEN 90 THEN 3
    WHEN 180 THEN 6
    WHEN 365 THEN 12
    ELSE NULL
  END
  FROM "Payment"
  WHERE "Payment"."userId" = "Subscription"."userId"
    AND "Payment"."status" = 'CONFIRMED'
    AND "Payment"."purpose" = 'SUBSCRIPTION'
  ORDER BY
    ("Payment"."confirmedAt" IS NULL) ASC,
    "Payment"."confirmedAt" DESC,
    "Payment"."createdAt" DESC
  LIMIT 1
);

CREATE INDEX "Subscription_planDurationMonths_status_expiresAt_idx"
ON "Subscription"("planDurationMonths", "status", "expiresAt");
