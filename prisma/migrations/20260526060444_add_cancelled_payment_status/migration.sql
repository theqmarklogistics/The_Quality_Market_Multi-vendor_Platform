-- CreateEnum
CREATE TYPE "public"."SellerModel" AS ENUM ('FULL_MANAGED', 'LOCAL_SELLER');

-- AlterEnum
ALTER TYPE "public"."PaymentStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "public"."Address" ADD COLUMN     "sector" TEXT;

-- AlterTable
ALTER TABLE "public"."CategoryCommission" ADD COLUMN     "sellerModel" TEXT;

-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "heightCm" DOUBLE PRECISION,
ADD COLUMN     "importOrigin" TEXT,
ADD COLUMN     "lengthCm" DOUBLE PRECISION,
ADD COLUMN     "weightKg" DOUBLE PRECISION,
ADD COLUMN     "widthCm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."Store" ADD COLUMN     "rejectionNotes" TEXT,
ADD COLUMN     "sellerModel" "public"."SellerModel" NOT NULL DEFAULT 'LOCAL_SELLER';

-- CreateTable
CREATE TABLE "public"."WeightShippingRate" (
    "id" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "minWeightKg" DOUBLE PRECISION NOT NULL,
    "maxWeightKg" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeightShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeightShippingRate_zone_minWeightKg_idx" ON "public"."WeightShippingRate"("zone", "minWeightKg");

-- CreateIndex
CREATE INDEX "CategoryCommission_category_sellerModel_idx" ON "public"."CategoryCommission"("category", "sellerModel");
