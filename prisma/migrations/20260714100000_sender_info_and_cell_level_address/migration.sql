-- Package sender info on external-delivery orders (shown on delivery documents),
-- and cell-level administrative detail on addresses (district → sector → cell → village).

ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "senderName"  TEXT,
    ADD COLUMN IF NOT EXISTS "senderPhone" TEXT,
    ADD COLUMN IF NOT EXISTS "senderEmail" TEXT;

ALTER TABLE "Address"
    ADD COLUMN IF NOT EXISTS "cell" TEXT;
