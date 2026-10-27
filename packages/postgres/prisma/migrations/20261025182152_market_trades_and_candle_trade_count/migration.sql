-- AlterTable
ALTER TABLE "Candle" ADD COLUMN     "tradeCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MarketTrade" (
    "tradeId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "quoteAmount" DECIMAL(38,18) NOT NULL,
    "side" "OrderSide" NOT NULL,
    "executedAt" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketTrade_pkey" PRIMARY KEY ("tradeId")
);

-- CreateIndex
CREATE INDEX "MarketTrade_symbol_executedAt_tradeId_idx" ON "MarketTrade"("symbol", "executedAt" DESC, "tradeId" DESC);
