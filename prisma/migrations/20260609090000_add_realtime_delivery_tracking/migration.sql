-- AlterEnum: new rider role
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'RIDER';

-- AlterEnum: "rider is arriving" sub-state, ordered before DELIVERED
ALTER TYPE "PoolDeliveryStatus" ADD VALUE IF NOT EXISTS 'ARRIVING' BEFORE 'DELIVERED';

-- AlterTable: realtime tracking fields on Order
ALTER TABLE "Order"
    ADD COLUMN "recipientLat"     DOUBLE PRECISION,
    ADD COLUMN "recipientLng"     DOUBLE PRECISION,
    ADD COLUMN "locationSharedAt" TIMESTAMP(3),
    ADD COLUMN "stopSequence"     INTEGER,
    ADD COLUMN "deliveredAt"      TIMESTAMP(3),
    ADD COLUMN "failureReason"    TEXT;

-- AlterTable: rider assignment + dispatch lifecycle + last-known location on DeliveryCorridor
ALTER TABLE "DeliveryCorridor"
    ADD COLUMN "assignedRiderId"  TEXT,
    ADD COLUMN "dispatchedAt"     TIMESTAMP(3),
    ADD COLUMN "completedAt"      TIMESTAMP(3),
    ADD COLUMN "riderLat"         DOUBLE PRECISION,
    ADD COLUMN "riderLng"         DOUBLE PRECISION,
    ADD COLUMN "riderLocationAt"  TIMESTAMP(3);

-- AddForeignKey: corridor -> assigned rider (User)
ALTER TABLE "DeliveryCorridor" ADD CONSTRAINT "DeliveryCorridor_assignedRiderId_fkey"
    FOREIGN KEY ("assignedRiderId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: RiderProfile
CREATE TABLE "RiderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "vehicleType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiderProfile_userId_key" ON "RiderProfile"("userId");

-- AddForeignKey
ALTER TABLE "RiderProfile" ADD CONSTRAINT "RiderProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
