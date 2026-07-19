-- Tariff labels and availability are versioned with the singleton pricing
-- settings. Checkout reads this desired state; existing Payment snapshots are
-- immutable and therefore keep their paid terms.
ALTER TABLE "PricingSettings"
ADD COLUMN "planNamesJson" TEXT NOT NULL DEFAULT '{"1":"1 месяц","3":"3 месяца","6":"6 месяцев","12":"12 месяцев"}';

ALTER TABLE "PricingSettings"
ADD COLUMN "availableDurationsJson" TEXT NOT NULL DEFAULT '[1,3,6,12]';

-- Internal notes share the support timeline in the admin UI but are always
-- excluded from user-facing support queries.
ALTER TABLE "SupportMessage"
ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false;

-- Explicit workflow state makes support KPI, filters, and database pagination
-- authoritative. Channel/topic keep the admin ready for Telegram and email
-- ingress without changing today's WEB conversations.
ALTER TABLE "SupportConversation"
ADD COLUMN "workflowState" TEXT NOT NULL DEFAULT 'NEW';

ALTER TABLE "SupportConversation"
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'WEB';

ALTER TABLE "SupportConversation"
ADD COLUMN "topic" TEXT NOT NULL DEFAULT 'Обращение в поддержку';

UPDATE "SupportConversation"
SET "workflowState" = CASE
  WHEN "status" = 'CLOSED' THEN 'CLOSED'
  WHEN (
    SELECT "authorRole"
    FROM "SupportMessage"
    WHERE "conversationId" = "SupportConversation"."id"
      AND "isInternal" = false
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT 1
  ) = 'ADMIN' THEN 'ANSWERED'
  WHEN EXISTS (
    SELECT 1
    FROM "SupportMessage"
    WHERE "conversationId" = "SupportConversation"."id"
      AND "authorRole" = 'ADMIN'
      AND "isInternal" = false
  ) THEN 'WAITING'
  ELSE 'NEW'
END;

CREATE INDEX "SupportConversation_workflowState_lastMessageAt_idx"
ON "SupportConversation"("workflowState", "lastMessageAt");
