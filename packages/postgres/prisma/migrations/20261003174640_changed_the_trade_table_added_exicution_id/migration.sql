/*
  Warnings:

  - Added the required column `executionId` to the `Trade` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "executionId" TEXT NOT NULL;
