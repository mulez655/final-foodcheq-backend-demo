-- CreateEnum
CREATE TYPE "PartnershipApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO');

-- CreateEnum
CREATE TYPE "BarterStatus" AS ENUM ('DRAFT', 'SENT', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "CashGapDirection" AS ENUM ('INITIATOR_PAYS', 'RECIPIENT_PAYS');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "earlyAccessOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPartner" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" "PartnershipApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentOpportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentInterest" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarterOffer" (
    "id" TEXT NOT NULL,
    "initiatorVendorId" TEXT NOT NULL,
    "recipientVendorId" TEXT NOT NULL,
    "status" "BarterStatus" NOT NULL DEFAULT 'DRAFT',
    "cashGapCents" INTEGER NOT NULL DEFAULT 0,
    "cashGapDirection" "CashGapDirection",
    "message" TEXT,
    "counterOfMessage" TEXT,
    "parentOfferId" TEXT,
    "fulfilledByInitiator" BOOLEAN NOT NULL DEFAULT false,
    "fulfilledByRecipient" BOOLEAN NOT NULL DEFAULT false,
    "disputeReason" TEXT,
    "disputeResolvedBy" TEXT,
    "disputeResolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BarterOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarterItem" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "valueCents" INTEGER NOT NULL,
    "isOffered" BOOLEAN NOT NULL,

    CONSTRAINT "BarterItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_token_idx" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PartnershipApplication_userId_key" ON "PartnershipApplication"("userId");

-- CreateIndex
CREATE INDEX "InvestmentInterest_opportunityId_idx" ON "InvestmentInterest"("opportunityId");

-- CreateIndex
CREATE INDEX "InvestmentInterest_userId_idx" ON "InvestmentInterest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentInterest_opportunityId_userId_key" ON "InvestmentInterest"("opportunityId", "userId");

-- CreateIndex
CREATE INDEX "BarterOffer_initiatorVendorId_idx" ON "BarterOffer"("initiatorVendorId");

-- CreateIndex
CREATE INDEX "BarterOffer_recipientVendorId_idx" ON "BarterOffer"("recipientVendorId");

-- CreateIndex
CREATE INDEX "BarterOffer_status_idx" ON "BarterOffer"("status");

-- CreateIndex
CREATE INDEX "BarterItem_offerId_idx" ON "BarterItem"("offerId");

-- CreateIndex
CREATE INDEX "BarterItem_productId_idx" ON "BarterItem"("productId");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipApplication" ADD CONSTRAINT "PartnershipApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentInterest" ADD CONSTRAINT "InvestmentInterest_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "InvestmentOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentInterest" ADD CONSTRAINT "InvestmentInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarterOffer" ADD CONSTRAINT "BarterOffer_initiatorVendorId_fkey" FOREIGN KEY ("initiatorVendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarterOffer" ADD CONSTRAINT "BarterOffer_recipientVendorId_fkey" FOREIGN KEY ("recipientVendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarterOffer" ADD CONSTRAINT "BarterOffer_parentOfferId_fkey" FOREIGN KEY ("parentOfferId") REFERENCES "BarterOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarterItem" ADD CONSTRAINT "BarterItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "BarterOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarterItem" ADD CONSTRAINT "BarterItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
