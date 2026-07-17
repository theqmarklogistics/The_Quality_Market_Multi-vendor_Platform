-- Hub the sender chose to drop the package at, for HUB_DROP_OFF intake. Null for
-- driver-sweep bookings (the rider collects from the pickup point instead).

ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "dropHubId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_dropHubId_idx"
    ON "Order"("dropHubId");

-- ON DELETE SET NULL: retiring a hub must not delete its historical bookings.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Order_dropHubId_fkey'
    ) THEN
        ALTER TABLE "Order"
            ADD CONSTRAINT "Order_dropHubId_fkey"
            FOREIGN KEY ("dropHubId") REFERENCES "DeliveryHub"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
