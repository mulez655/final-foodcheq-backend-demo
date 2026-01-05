-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "relatedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "shortDesc" TEXT;
