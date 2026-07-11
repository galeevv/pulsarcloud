-- Price inputs and snapshot never change after quote creation. Lifecycle may
-- only set consumedAt.
CREATE TRIGGER "PriceQuote_immutable_pricing"
BEFORE UPDATE OF
  "userId", "pricingVersionId", "purpose", "currency", "durationMonths",
  "deviceLimit", "lteEnabled", "referralDiscountPct", "subtotalRub",
  "discountRub", "totalRub", "pricingSnapshot", "idempotencyKey", "expiresAt"
ON "PriceQuote"
BEGIN
  SELECT RAISE(ABORT, 'PriceQuote pricing fields are immutable');
END;

-- A period is historical evidence of the entitlement purchased by one payment.
CREATE TRIGGER "SubscriptionPeriod_immutable"
BEFORE UPDATE ON "SubscriptionPeriod"
BEGIN
  SELECT RAISE(ABORT, 'SubscriptionPeriod is immutable');
END;

-- Payment commercial terms are copied from the quote once and cannot be
-- rewritten by webhook or admin code. Lifecycle/refund fields remain mutable.
CREATE TRIGGER "Payment_immutable_terms"
BEFORE UPDATE OF
  "userId", "quoteId", "provider", "currency", "amountRub",
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
