-- Specific address where a to-be-imported product is currently located
-- (seller-entered at product creation; only meaningful when importOrigin is set).

ALTER TABLE "Product"
    ADD COLUMN IF NOT EXISTS "importAddress" TEXT;
