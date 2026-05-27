-- CreateTable
CREATE TABLE "public"."BannerConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL DEFAULT 'Get 20% OFF on your first order with code NEW20.',
    "couponCode" TEXT DEFAULT 'NEW20',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BannerConfig_pkey" PRIMARY KEY ("id")
);
