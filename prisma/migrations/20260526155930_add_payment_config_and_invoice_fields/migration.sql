-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "invoiceRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoiceRequestedAt" TIMESTAMP(3),
ADD COLUMN     "invoiceSentAt" TIMESTAMP(3),
ADD COLUMN     "invoiceStatus" TEXT;

-- CreateTable
CREATE TABLE "public"."PaymentConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "momoPayCode" TEXT,
    "momoAccountName" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountName" TEXT,
    "bankBranch" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentConfig_pkey" PRIMARY KEY ("id")
);
