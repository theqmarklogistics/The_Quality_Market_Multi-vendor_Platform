-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('STANDARD_UNPOOLED', 'KIGALI_POOL');

-- CreateEnum
CREATE TYPE "IntakeMethod" AS ENUM ('HUB_DROP_OFF', 'DRIVER_SWEEP');

-- CreateEnum
CREATE TYPE "PoolDeliveryStatus" AS ENUM ('PENDING_INTAKE', 'SORTING', 'IN_TRANSIT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('NOT_HELD', 'HELD', 'RELEASED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CorridorStatus" AS ENUM ('OPEN', 'CLOSED', 'IN_TRANSIT', 'COMPLETED');

-- CreateTable
CREATE TABLE "DeliveryCorridor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL,
    "baseRouteCost" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "status" "CorridorStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryCorridor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryCorridor_runDate_status_idx" ON "DeliveryCorridor"("runDate", "status");

-- AlterTable
ALTER TABLE "Order"
    ADD COLUMN "deliveryType"     "DeliveryType"       NOT NULL DEFAULT 'STANDARD_UNPOOLED',
    ADD COLUMN "intakeMethod"     "IntakeMethod",
    ADD COLUMN "landmarkAddress"  TEXT,
    ADD COLUMN "deliveryStatus"   "PoolDeliveryStatus",
    ADD COLUMN "deliveryOtp"      VARCHAR(4),
    ADD COLUMN "escrowStatus"     "EscrowStatus"       NOT NULL DEFAULT 'NOT_HELD',
    ADD COLUMN "deliveryFeeShare" DOUBLE PRECISION,
    ADD COLUMN "corridorId"       TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_corridorId_fkey"
    FOREIGN KEY ("corridorId") REFERENCES "DeliveryCorridor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
