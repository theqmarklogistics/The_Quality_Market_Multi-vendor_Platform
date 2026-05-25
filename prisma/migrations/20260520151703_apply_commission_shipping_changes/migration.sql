-- CreateEnum
CREATE TYPE "public"."ShippingRuleType" AS ENUM ('REGION', 'KM', 'DEFAULT');

-- AlterTable
ALTER TABLE "public"."Address" ADD COLUMN     "district" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "commission" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "shippingCost" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "shippingRuleId" TEXT;

-- AlterTable
ALTER TABLE "public"."Store" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "public"."ShippingRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."ShippingRuleType" NOT NULL,
    "regionKey" TEXT,
    "minKm" DOUBLE PRECISION,
    "maxKm" DOUBLE PRECISION,
    "flatRate" DOUBLE PRECISION,
    "perKmRate" DOUBLE PRECISION,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CategoryCommission" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "percent" DOUBLE PRECISION,
    "fixedAmount" DOUBLE PRECISION,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "userId" TEXT,
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);
