/*
  Warnings:

  - A unique constraint covering the columns `[orderId]` on the table `Deposit` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[paymentId]` on the table `Deposit` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Deposit" ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "paymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_orderId_key" ON "Deposit"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_paymentId_key" ON "Deposit"("paymentId");
