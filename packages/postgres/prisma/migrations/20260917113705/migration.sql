/*
  Warnings:

  - You are about to drop the column `clientOrderId` on the `Order` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Order_userId_clientOrderId_key";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "clientOrderId";
