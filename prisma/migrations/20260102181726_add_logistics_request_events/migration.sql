-- CreateTable
CREATE TABLE "LogisticsRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogisticsRequestEvent_requestId_idx" ON "LogisticsRequestEvent"("requestId");

-- AddForeignKey
ALTER TABLE "LogisticsRequestEvent" ADD CONSTRAINT "LogisticsRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LogisticsRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
