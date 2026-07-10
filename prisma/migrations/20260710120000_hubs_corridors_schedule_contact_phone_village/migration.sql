-- Checkout contact phone (may differ from the saved address phone)
ALTER TABLE "Order" ADD COLUMN "contactPhone" TEXT;

-- Village-level address detail (umudugudu) for approximate geocoding fallback
ALTER TABLE "Address" ADD COLUMN "village" TEXT;

-- CreateTable: physical drop-off / dispatch hubs (admin-managed)
CREATE TABLE "DeliveryHub" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "landmark" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryHub_pkey" PRIMARY KEY ("id")
);

-- CreateTable: admin-registered corridors (named routes served from a hub)
CREATE TABLE "CorridorRoute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "description" TEXT,
    "areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorridorRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable: recurring public schedule entries (rider departs hub along corridor)
CREATE TABLE "CorridorSchedule" (
    "id" TEXT NOT NULL,
    "corridorRouteId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "departTime" TEXT NOT NULL,
    "riderId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorridorSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorridorRoute_hubId_isActive_idx" ON "CorridorRoute"("hubId", "isActive");

-- CreateIndex
CREATE INDEX "CorridorSchedule_corridorRouteId_dayOfWeek_idx" ON "CorridorSchedule"("corridorRouteId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "CorridorRoute" ADD CONSTRAINT "CorridorRoute_hubId_fkey"
    FOREIGN KEY ("hubId") REFERENCES "DeliveryHub"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridorSchedule" ADD CONSTRAINT "CorridorSchedule_corridorRouteId_fkey"
    FOREIGN KEY ("corridorRouteId") REFERENCES "CorridorRoute"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridorSchedule" ADD CONSTRAINT "CorridorSchedule_riderId_fkey"
    FOREIGN KEY ("riderId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
