-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'paypal',
ADD COLUMN     "shippingFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shippingType" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN     "subtotalAmount" INTEGER NOT NULL DEFAULT 0;
