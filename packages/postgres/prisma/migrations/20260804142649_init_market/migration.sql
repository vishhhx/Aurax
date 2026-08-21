-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('TRADING', 'HALTED', 'MAINTENANCE', 'CANCEL_ONLY', 'POST_ONLY');

-- CreateTable
CREATE TABLE "Market" (
    "marketId" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "baseAssetId" TEXT NOT NULL,
    "quoteAssetId" TEXT NOT NULL,
    "status" "MarketStatus" NOT NULL DEFAULT 'TRADING',
    "tickSize" DECIMAL(30,18) NOT NULL,
    "stepSize" DECIMAL(30,18) NOT NULL,
    "minPrice" DECIMAL(30,18) NOT NULL,
    "maxPrice" DECIMAL(30,18) NOT NULL,
    "minQuantity" DECIMAL(30,18) NOT NULL,
    "maxQuantity" DECIMAL(30,18) NOT NULL,
    "minNotional" DECIMAL(30,18) NOT NULL,
    "makerFee" DECIMAL(10,8) NOT NULL,
    "takerFee" DECIMAL(10,8) NOT NULL,
    "pricePrecision" INTEGER NOT NULL,
    "quantityPrecision" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("marketId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_symbol_key" ON "Market"("symbol");

-- CreateIndex
CREATE INDEX "Market_baseAssetId_idx" ON "Market"("baseAssetId");

-- CreateIndex
CREATE INDEX "Market_quoteAssetId_idx" ON "Market"("quoteAssetId");

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_baseAssetId_fkey" FOREIGN KEY ("baseAssetId") REFERENCES "Asset"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_quoteAssetId_fkey" FOREIGN KEY ("quoteAssetId") REFERENCES "Asset"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;
