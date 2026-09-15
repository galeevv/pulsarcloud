CREATE TABLE "InfrastructurePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "dueAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "InfrastructurePayment_status_dueAt_idx" ON "InfrastructurePayment"("status", "dueAt");
CREATE INDEX "InfrastructurePayment_dueAt_idx" ON "InfrastructurePayment"("dueAt");
