-- Admin kill-switch for EXPRESS delivery: when false, express is hidden at
-- checkout/booking and the APIs reject new express orders.
ALTER TABLE "ExternalDeliveryConfig"
    ADD COLUMN IF NOT EXISTS "expressEnabled" BOOLEAN NOT NULL DEFAULT true;
