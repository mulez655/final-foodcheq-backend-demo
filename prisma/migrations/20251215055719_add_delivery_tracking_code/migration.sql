/*
  Warnings:

  - A unique constraint covering the columns `[trackingCode]` on the table `Delivery` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "trackingCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_trackingCode_key" ON "Delivery"("trackingCode");
