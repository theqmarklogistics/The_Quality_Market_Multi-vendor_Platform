-- Distance + weight pricing for pooled/external delivery.
-- Admin-tunable rate knobs on the external-delivery config singleton.
ALTER TABLE "ExternalDeliveryConfig"
    ADD COLUMN "baseRatePerKgKm"  DOUBLE PRECISION NOT NULL DEFAULT 8,
    ADD COLUMN "minimumFloor"     DOUBLE PRECISION NOT NULL DEFAULT 2000,
    ADD COLUMN "volumetricFactor" DOUBLE PRECISION NOT NULL DEFAULT 200,
    ADD COLUMN "distanceTiers"    JSONB NOT NULL DEFAULT '[]';

-- Package weight/dimensions captured at booking for external delivery-only orders.
ALTER TABLE "Order"
    ADD COLUMN "packageWeightKg" DOUBLE PRECISION,
    ADD COLUMN "packageLengthCm" DOUBLE PRECISION,
    ADD COLUMN "packageWidthCm"  DOUBLE PRECISION,
    ADD COLUMN "packageHeightCm" DOUBLE PRECISION;
