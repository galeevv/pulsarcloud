-- Normalize legacy development statuses to the billing state machine.
UPDATE "Payment" SET "status" = 'SUCCEEDED' WHERE "status" = 'CONFIRMED';
UPDATE "Payment" SET "status" = 'REFUNDED' WHERE "status" = 'CHARGEBACKED';

-- Refund state is stored on the payment so partial refunds can be accumulated
-- idempotently across distinct provider events.
ALTER TABLE "Payment" ADD COLUMN "refundedAmountRub" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "refundedAt" DATETIME;

-- The verified provider event type is immutable evidence used during replay.
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "eventType" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "verifiedAt" DATETIME;

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
