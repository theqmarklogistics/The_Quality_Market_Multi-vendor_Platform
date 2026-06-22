-- Pooled-delivery savings returned to external partners as redeemable account credit.
ALTER TABLE "User" ADD COLUMN "deliveryCreditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Order"
    ADD COLUMN "poolingSavings" DOUBLE PRECISION,
    ADD COLUMN "creditApplied"  DOUBLE PRECISION DEFAULT 0;
