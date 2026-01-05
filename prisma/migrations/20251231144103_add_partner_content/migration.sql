-- CreateEnum
CREATE TYPE "PartnerDocCategory" AS ENUM ('GENERAL', 'REPORT', 'GUIDE', 'CONTRACT', 'FINANCIAL', 'POLICY');

-- CreateTable
CREATE TABLE "PartnerAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "PartnerAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "PartnerDocCategory" NOT NULL DEFAULT 'GENERAL',
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerAnnouncement_isActive_idx" ON "PartnerAnnouncement"("isActive");

-- CreateIndex
CREATE INDEX "PartnerAnnouncement_createdAt_idx" ON "PartnerAnnouncement"("createdAt");

-- CreateIndex
CREATE INDEX "PartnerDocument_isActive_idx" ON "PartnerDocument"("isActive");

-- CreateIndex
CREATE INDEX "PartnerDocument_category_idx" ON "PartnerDocument"("category");

-- CreateIndex
CREATE INDEX "PartnerDocument_createdAt_idx" ON "PartnerDocument"("createdAt");
