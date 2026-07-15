// Batch stop ordering — nearest first (ascending hub→drop road distance).
// Pure helpers, unit-tested in scripts/check-batch-ordering.mjs. The road
// distances themselves come from lib/distanceProvider (computed once at
// corridor build time and persisted on Order.deliveryDistanceKm).

/**
 * Attach each stop's hub→drop distance and return a NEW array sorted nearest
 * first. `distances` aligns 1:1 with `stops` (null entries = unknown). Stops
 * with unknown distances keep their relative order and sort last, so a missing
 * geocode can never push a known-near stop to the end of a rider's run.
 *
 * @param {Array<object>} stops
 * @param {Array<number|null>} distances
 * @returns {Array<object & { deliveryDistanceKm: number|null }>}
 */
export function orderStopsByDistance(stops = [], distances = []) {
    const tagged = stops.map((s, i) => ({
        ...s,
        deliveryDistanceKm: Number.isFinite(distances[i]) ? round2(distances[i]) : null,
    }));
    return tagged
        .map((s, i) => ({ s, i }))
        .sort((a, b) => {
            const da = a.s.deliveryDistanceKm;
            const db = b.s.deliveryDistanceKm;
            if (da == null && db == null) return a.i - b.i; // stable
            if (da == null) return 1;
            if (db == null) return -1;
            return da - db || a.i - b.i;
        })
        .map(({ s }) => s);
}

function round2(n) {
    return parseFloat(Number(n).toFixed(2));
}
