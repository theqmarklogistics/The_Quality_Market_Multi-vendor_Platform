-- Persistent caches for paid geo APIs: geocoding results by normalized address
-- string, and road-route distances by rounded coordinate pair. Both exist to
-- avoid repeat billing on the Google Geocoding / Routes APIs.

CREATE TABLE IF NOT EXISTS "GeocodeCache" (
    "id"        TEXT NOT NULL,
    "query"     TEXT NOT NULL,
    "lat"       DOUBLE PRECISION NOT NULL,
    "lng"       DOUBLE PRECISION NOT NULL,
    "precision" TEXT,
    "provider"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GeocodeCache_query_key" ON "GeocodeCache"("query");

CREATE TABLE IF NOT EXISTS "RouteCache" (
    "id"          TEXT NOT NULL,
    "key"         TEXT NOT NULL,
    "distanceKm"  DOUBLE PRECISION NOT NULL,
    "durationMin" DOUBLE PRECISION,
    "provider"    TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RouteCache_key_key" ON "RouteCache"("key");
