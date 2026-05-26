-- AlterTable
ALTER TABLE "public"."Coupon" ADD COLUMN     "maxUses" INTEGER,
ADD COLUMN     "usedCount" INTEGER NOT NULL DEFAULT 0;
