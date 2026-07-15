-- Persisted hub→drop road distance per order-assignment, so rider batches are
-- returned sorted by delivery distance ascending (nearest first) without
-- recomputing on every load.

ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "deliveryDistanceKm" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "Order_corridorId_deliveryDistanceKm_idx"
    ON "Order"("corridorId", "deliveryDistanceKm");
