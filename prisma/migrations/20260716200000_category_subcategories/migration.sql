-- Nested product categories (up to 3 levels, enforced in the admin API):
-- a category may point at a parent category. Deleting a parent is blocked in
-- the API while it has children; SET NULL is the safety net.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

ALTER TABLE "Category"
    ADD CONSTRAINT "Category_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Category"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Category_parentId_idx" ON "Category"("parentId");
