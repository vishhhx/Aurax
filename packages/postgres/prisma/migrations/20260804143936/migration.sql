/*
  Warnings:

  - The primary key for the `Market` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "Market" DROP CONSTRAINT "Market_pkey",
ALTER COLUMN "marketId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Market_pkey" PRIMARY KEY ("marketId");
