-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('CUSTOMER', 'ADMIN', 'SELLER', 'LOGISTICS_MANAGER', 'FINANCIAL_OPERATIONAL', 'WAREHOUSE_KEEPER');

-- AlterEnum
ALTER TYPE "public"."OrderStatus" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "customStatusLabel" TEXT,
ADD COLUMN     "publicStatusNote" TEXT;

-- AlterTable
ALTER TABLE "public"."Store" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "role" "public"."UserRole" NOT NULL DEFAULT 'CUSTOMER';
