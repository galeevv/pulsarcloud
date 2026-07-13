-- Stage plan changes at the paid renewal boundary without changing the
-- currently provisioned device/LTE parameters.
ALTER TABLE "Subscription" ADD COLUMN "nextParametersAt" DATETIME;

-- A user may have only one provider checkout in flight. This closes the race
-- between two requests that selected different renewal parameters.
CREATE UNIQUE INDEX "Payment_userId_open_key"
ON "Payment"("userId")
WHERE "status" IN ('CREATED', 'PENDING');
