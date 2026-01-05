/*
  Warnings:

  - You are about to drop the column `currency` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `priceKobo` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Product" DROP COLUMN "currency",
DROP COLUMN "priceKobo",
ADD COLUMN     "priceUsdCents" INTEGER NOT NULL DEFAULT 0;
