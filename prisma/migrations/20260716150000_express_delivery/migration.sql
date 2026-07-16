-- EXPRESS delivery: instant dispatch (skips the pooled batching schedule).
-- Priced by the same segmented-taper + weight-range formula, but with its own
-- admin-tunable base rate.

ALTER TYPE "DeliveryType" ADD VALUE IF NOT EXISTS 'EXPRESS';

ALTER TABLE "ExternalDeliveryConfig"
    ADD COLUMN IF NOT EXISTS "expressBaseRatePerKgKm" DOUBLE PRECISION NOT NULL DEFAULT 16;
