-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BalanceReservation" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalanceReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BalanceReservation_referenceId_key" ON "BalanceReservation"("referenceId");

-- CreateIndex
CREATE INDEX "BalanceReservation_userId_idx" ON "BalanceReservation"("userId");

-- CreateIndex
CREATE INDEX "BalanceReservation_userId_assetId_idx" ON "BalanceReservation"("userId", "assetId");

-- AddForeignKey
ALTER TABLE "BalanceReservation" ADD CONSTRAINT "BalanceReservation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;
