/*
  Warnings:

  - Made the column `trackingCode` on table `Delivery` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Delivery" ALTER COLUMN "trackingCode" SET NOT NULL;
