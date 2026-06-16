-- External-seller delivery: let off-platform merchants use the pooled-delivery
-- pipeline as delivery-only orders (no platform store / products).

-- New role for off-platform delivery partners.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EXTERNAL_SELLER';

-- Order.storeId becomes nullable (external deliveries have no platform store).
ALTER TABLE "Order" ALTER COLUMN "storeId" DROP NOT NULL;

-- External delivery fields on Order.
ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "isExternalDelivery" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "pickupContactName"  TEXT,
    ADD COLUMN IF NOT EXISTS "pickupPhone"        TEXT,
    ADD COLUMN IF NOT EXISTS "pickupLandmark"     TEXT,
    ADD COLUMN IF NOT EXISTS "pickupLat"          DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "pickupLng"          DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "packageDescription" TEXT,
    ADD COLUMN IF NOT EXISTS "declaredValue"      DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "trackingToken"      TEXT;

-- Unguessable public tracking token must be unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS "Order_trackingToken_key" ON "Order"("trackingToken");

-- Admin-configurable external-delivery pricing (single "default" row).
CREATE TABLE IF NOT EXISTS "ExternalDeliveryConfig" (
    "id"        TEXT NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL DEFAULT 2000,
    "perSector" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExternalDeliveryConfig_pkey" PRIMARY KEY ("id")
);
