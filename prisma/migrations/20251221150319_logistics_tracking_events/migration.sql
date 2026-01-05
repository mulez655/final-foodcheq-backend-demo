/*
  Warnings:

  - Added the required column `status` to the `DeliveryEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DeliveryEvent" ADD COLUMN     "status" "DeliveryStatus" NOT NULL;
