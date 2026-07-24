-- Staff member who received the package for an external delivery (optional).
-- id + name snapshot so delivery documents stay stable even if the staff record
-- is later renamed or removed. Nullable, so existing rows are untouched.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "receivedById" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "receivedByName" TEXT;
