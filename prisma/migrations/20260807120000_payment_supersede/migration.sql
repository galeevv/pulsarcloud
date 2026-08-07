-- A user who returns from an unpaid checkout and picks a different plan gets a
-- fresh invoice. The abandoned one is canceled as superseded rather than
-- blocking the new attempt on the single-open-checkout guard.
ALTER TABLE "Payment" ADD COLUMN "supersededAt" DATETIME;
ALTER TABLE "Payment" ADD COLUMN "supersededByPaymentId" TEXT;

CREATE INDEX "Payment_supersededByPaymentId_idx"
ON "Payment"("supersededByPaymentId");
