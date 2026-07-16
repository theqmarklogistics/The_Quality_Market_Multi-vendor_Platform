-- New shipping-fee engine: segmented distance taper + admin-defined weight ranges.
-- Replaces the old sliding-tier formula and the pluggable strategy system.

-- Taper knobs on the external-delivery config singleton; drop the removed
-- old-formula / strategy columns (config-only, no historical value).
ALTER TABLE "ExternalDeliveryConfig"
    ADD COLUMN IF NOT EXISTS "taperStepKm"      DOUBLE PRECISION NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS "taperDropPerStep" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    ADD COLUMN IF NOT EXISTS "taperFloorPct"    DOUBLE PRECISION NOT NULL DEFAULT 0.50;

ALTER TABLE "ExternalDeliveryConfig"
    DROP COLUMN IF EXISTS "distanceTiers",
    DROP COLUMN IF EXISTS "activeStrategy",
    DROP COLUMN IF EXISTS "strategyParams";

-- Manual-review flag: set when a package weight falls outside every weight range.
ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "shippingNeedsReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: admin-defined weight range → chargeable weight value.
CREATE TABLE "DeliveryWeightRange" (
    "id" TEXT NOT NULL,
    "minWeightKg" DOUBLE PRECISION NOT NULL,
    "maxWeightKg" DOUBLE PRECISION,
    "chargeableKg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryWeightRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryWeightRange_minWeightKg_idx" ON "DeliveryWeightRange"("minWeightKg");
