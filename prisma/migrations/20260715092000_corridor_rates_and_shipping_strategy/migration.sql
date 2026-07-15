-- Corridor lane pricing (fixed or per-km rate overriding the formula fee for
-- drops inside a corridor's areas) + admin-selectable shipping-fee strategy.

ALTER TABLE "CorridorRoute"
    ADD COLUMN IF NOT EXISTS "fixedRate" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "perKmRate" DOUBLE PRECISION;

ALTER TABLE "ExternalDeliveryConfig"
    ADD COLUMN IF NOT EXISTS "activeStrategy" TEXT NOT NULL DEFAULT 'LEGACY',
    ADD COLUMN IF NOT EXISTS "strategyParams" JSONB NOT NULL DEFAULT '{}';
