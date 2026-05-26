-- CreateTable
CREATE TABLE "public"."HeroConfig" (
    "slot" TEXT NOT NULL,
    "badgeText" TEXT,
    "headline" TEXT,
    "description" TEXT,
    "startingPrice" TEXT,
    "cta1Label" TEXT,
    "cta1Href" TEXT,
    "cta2Label" TEXT,
    "cta2Href" TEXT,
    "cardTitle" TEXT,
    "accentColor" TEXT,
    "linkLabel" TEXT,
    "linkHref" TEXT,
    "imageUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroConfig_pkey" PRIMARY KEY ("slot")
);
