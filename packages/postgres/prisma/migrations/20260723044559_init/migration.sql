/*
  Warnings:

  - Added the required column `imageUrl` to the `Asset` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "imageUrl" TEXT NOT NULL,
ADD COLUMN     "network" TEXT;
