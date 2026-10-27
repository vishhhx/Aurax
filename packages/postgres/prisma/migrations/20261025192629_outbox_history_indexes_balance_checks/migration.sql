-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Trade_executionId_idx" ON "Trade"("executionId");

-- CreateIndex
CREATE INDEX "Trade_userId_createdAt_idx" ON "Trade"("userId", "createdAt");

-- Balance invariants enforced by the database (not representable in the Prisma schema).
-- Any settlement/reservation bug now fails its transaction instead of producing a negative balance.
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_availableBalance_nonnegative" CHECK ("availableBalance" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_lockedBalance_nonnegative" CHECK ("lockedBalance" >= 0);
ALTER TABLE "BalanceReservation" ADD CONSTRAINT "BalanceReservation_remainingAmount_nonnegative" CHECK ("remainingAmount" >= 0);
ALTER TABLE "BalanceReservation" ADD CONSTRAINT "BalanceReservation_remaining_le_amount" CHECK ("remainingAmount" <= "amount");
