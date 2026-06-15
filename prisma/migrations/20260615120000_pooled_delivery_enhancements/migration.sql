-- AlterTable: pooled-delivery hardening fields on Order
--   deliveryAttempts — number of failed delivery attempts (drives re-pool decisions)
--   otpAttempts / otpLockedUntil — brute-force throttle on the 4-digit delivery code
ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "otpAttempts"      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "otpLockedUntil"   TIMESTAMP(3);
