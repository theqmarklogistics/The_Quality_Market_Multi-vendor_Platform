-- Ordered landmarks the rider passes along a corridor, recorded from the
-- beginning of the route to its end (array order is the route order).
ALTER TABLE "CorridorRoute" ADD COLUMN "landmarks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
