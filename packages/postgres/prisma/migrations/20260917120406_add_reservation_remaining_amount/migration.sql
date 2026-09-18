/*
  Warnings:

  - You are about to alter the column `amount` on the `BalanceReservation` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(30,8)`.
  - Added the required column `remainingAmount` to the `BalanceReservation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BalanceReservation" ADD COLUMN     "remainingAmount" DECIMAL(30,8) NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(30,8);
