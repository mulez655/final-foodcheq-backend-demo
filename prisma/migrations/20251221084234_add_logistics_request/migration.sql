-- CreateTable
CREATE TABLE "LogisticsRequest" (
    "id" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "orderId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "dropoffLocation" TEXT NOT NULL,
    "pickupDate" TIMESTAMP(3),
    "packageType" TEXT NOT NULL,
    "notes" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "riderName" TEXT,
    "riderPhone" TEXT,
    "currentLocation" TEXT,
    "eta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsRequest_trackingCode_key" ON "LogisticsRequest"("trackingCode");
