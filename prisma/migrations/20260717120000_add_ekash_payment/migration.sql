-- AlterEnum
-- Adds the eKash payment method. Appended at the end of the enum; the value is
-- not used within this migration, so it is safe alongside the column additions.
ALTER TYPE "public"."PaymentMethod" ADD VALUE IF NOT EXISTS 'EKASH';

-- AlterTable
ALTER TABLE "public"."PaymentConfig" ADD COLUMN     "ekashNumber" TEXT,
ADD COLUMN     "ekashAccountName" TEXT;
