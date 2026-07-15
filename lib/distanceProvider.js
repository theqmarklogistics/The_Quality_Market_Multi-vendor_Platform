// Road-network route distances for delivery pricing and batching.
//
// Provider chain per lookup (server-side only — the Google key never reaches
// the browser):
//   1. RouteCache (DB, keyed by rounded coords) — avoids repeat API billing
//   2. Google Routes API (computeRoutes / computeRouteMatrix, field-masked)
//   3. OSRM (only when DELIVERY_OSRM_PRICING=true, existing opt-in)
//   4. haversine × ROAD_DISTANCE_FACTOR (default 1.4) — logged as a fallback
//
// The Directions & Distance Matrix APIs are legacy (Mar 2025) — this uses the
// Routes API exclusively.
import prisma from "./prisma.js";
import {
    haversineKm,
    KIGALI_HUB,
    fetchOsrmRoute,
    fetchOsrmTableDistances,
    isOsrmPricingEnabled,
} from "./deliveryEta.js";

const GOOGLE_KEY =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    "";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const ROAD_FACTOR = (() => {
    const f = Number(process.env.ROAD_DISTANCE_FACTOR);
    return Number.isFinite(f) && f > 0 ? f : 1.4;
})();

const validPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
const latLng = (p) => ({ latLng: { latitude: p.lat, longitude: p.lng } });
// "123.4s" → minutes
const durationMin = (d) => {
    const s = parseFloat(String(d || "").replace(/s$/i, ""));
    return Number.isFinite(s) ? Math.max(1, Math.round(s / 60)) : null;
};

// ── DB cache (rounded to 4 dp ≈ 11 m so nearby pins share an entry) ──────────

function cacheKey(origin, dest) {
    const r = (n) => n.toFixed(4);
    return `${r(origin.lat)},${r(origin.lng)}->${r(dest.lat)},${r(dest.lng)}`;
}

async function cacheGet(key) {
    try {
        const hit = await prisma.routeCache.findUnique({ where: { key } });
        if (hit && Number.isFinite(hit.distanceKm)) return hit;
    } catch (_) { /* table missing / DB hiccup — treat as miss */ }
    return null;
}

function cacheSet(key, { distanceKm, durationMin: mins, provider }) {
    prisma.routeCache
        .upsert({
            where: { key },
            update: { distanceKm, durationMin: mins ?? null, provider },
            create: { key, distanceKm, durationMin: mins ?? null, provider },
        })
        .catch(() => { /* best-effort */ });
}

// ── Google Routes API ────────────────────────────────────────────────────────

async function googleFetch(url, body, fieldMask, { timeoutMs = 6000 } = {}) {
    if (!GOOGLE_KEY) return null;
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_KEY,
                // Field mask keeps the request in the cheaper "Basic" SKU.
                "X-Goog-FieldMask": fieldMask,
            },
            body: JSON.stringify(body),
        });
        clearTimeout(t);
        if (!res.ok) {
            console.warn(`[routes-api] HTTP ${res.status} from ${url.includes("Matrix") ? "matrix" : "routes"}`);
            return null;
        }
        return await res.json();
    } catch (err) {
        console.warn("[routes-api] request failed:", err?.message || err);
        return null;
    }
}

/**
 * Road distance origin→dest via Google Routes API computeRoutes.
 * `intermediates` (ordered waypoints) turns this into a full-route measure.
 * Returns { distanceKm, durationMin } or null.
 */
async function googleRoute(origin, dest, intermediates = []) {
    const body = {
        origin: { location: latLng(origin) },
        destination: { location: latLng(dest) },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
    };
    if (intermediates.length) {
        body.intermediates = intermediates.map((p) => ({ location: latLng(p) }));
    }
    const data = await googleFetch(ROUTES_URL, body, "routes.distanceMeters,routes.duration");
    const route = data?.routes?.[0];
    if (!route || !Number.isFinite(route.distanceMeters)) return null;
    return { distanceKm: route.distanceMeters / 1000, durationMin: durationMin(route.duration) };
}

/**
 * One origin → many destinations via computeRouteMatrix (single billed request).
 * Returns an array aligned with `dests` of { distanceKm, durationMin } | null.
 */
async function googleMatrix(origin, dests) {
    const body = {
        origins: [{ waypoint: { location: latLng(origin) } }],
        destinations: dests.map((p) => ({ waypoint: { location: latLng(p) } })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
    };
    const data = await googleFetch(
        MATRIX_URL,
        body,
        "originIndex,destinationIndex,distanceMeters,duration,condition"
    );
    if (!Array.isArray(data)) return null;
    const out = new Array(dests.length).fill(null);
    for (const el of data) {
        if (
            el?.condition === "ROUTE_EXISTS" &&
            Number.isFinite(el.distanceMeters) &&
            Number.isInteger(el.destinationIndex)
        ) {
            out[el.destinationIndex] = {
                distanceKm: el.distanceMeters / 1000,
                durationMin: durationMin(el.duration),
            };
        }
    }
    return out;
}

// ── Fallbacks ────────────────────────────────────────────────────────────────

function haversineRoadEstimate(origin, dest) {
    const straight = haversineKm(origin, dest);
    if (straight == null) return null;
    return straight * ROAD_FACTOR;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Road distance (km) origin→dest through the provider chain. Never throws;
 * returns null only when either point is missing coordinates.
 */
export async function routeDistanceKm(origin, dest) {
    if (!validPoint(origin) || !validPoint(dest)) return null;

    const key = cacheKey(origin, dest);
    const cached = await cacheGet(key);
    if (cached) return cached.distanceKm;

    const google = await googleRoute(origin, dest);
    if (google) {
        cacheSet(key, { ...google, provider: "google" });
        return google.distanceKm;
    }

    if (isOsrmPricingEnabled()) {
        const osrm = await fetchOsrmRoute([origin, dest]);
        if (osrm) {
            cacheSet(key, { distanceKm: osrm.distanceKm, durationMin: osrm.durationMin, provider: "osrm" });
            return osrm.distanceKm;
        }
    }

    // Fallback estimates are NOT cached so the road APIs get retried next time.
    console.warn(`[distance-fallback] haversine×${ROAD_FACTOR} used for ${key}`);
    return haversineRoadEstimate(origin, dest);
}

/**
 * Road distances (km) origin→each dest, cache-first, then ONE Google matrix
 * call for the misses, then OSRM table / haversine×factor per remaining miss.
 * Returns an array aligned with `dests`; entries are null only for invalid points.
 */
export async function routeMatrixKm(origin, dests = []) {
    if (!validPoint(origin) || !Array.isArray(dests) || !dests.length) return [];

    const result = new Array(dests.length).fill(null);
    const missIdx = [];

    for (let i = 0; i < dests.length; i++) {
        if (!validPoint(dests[i])) continue;
        const cached = await cacheGet(cacheKey(origin, dests[i]));
        if (cached) result[i] = cached.distanceKm;
        else missIdx.push(i);
    }
    if (!missIdx.length) return result;

    const missPoints = missIdx.map((i) => dests[i]);
    const google = await googleMatrix(origin, missPoints);
    const stillMissing = [];
    if (google) {
        google.forEach((el, j) => {
            const i = missIdx[j];
            if (el) {
                result[i] = el.distanceKm;
                cacheSet(cacheKey(origin, dests[i]), { ...el, provider: "google" });
            } else {
                stillMissing.push(i);
            }
        });
    } else {
        stillMissing.push(...missIdx);
    }
    if (!stillMissing.length) return result;

    if (isOsrmPricingEnabled()) {
        const osrm = await fetchOsrmTableDistances(origin, stillMissing.map((i) => dests[i]));
        if (osrm) {
            stillMissing.forEach((i, j) => {
                if (osrm[j] != null) {
                    result[i] = osrm[j];
                    cacheSet(cacheKey(origin, dests[i]), { distanceKm: osrm[j], provider: "osrm" });
                }
            });
        }
    }

    for (const i of stillMissing) {
        if (result[i] == null) {
            console.warn(`[distance-fallback] haversine×${ROAD_FACTOR} used for ${cacheKey(origin, dests[i])}`);
            result[i] = haversineRoadEstimate(origin, dests[i]);
        }
    }
    return result;
}

/**
 * Full-route distance through ordered stops (hub → s1 → s2 → …). One
 * computeRoutes call with intermediates; falls back to summed haversine legs
 * × road factor.
 */
export async function fullRouteKm(orderedStops, origin = KIGALI_HUB) {
    const pts = (orderedStops || []).filter(validPoint);
    if (!validPoint(origin) || !pts.length) return 0;

    const dest = pts[pts.length - 1];
    const intermediates = pts.slice(0, -1);
    const google = await googleRoute(origin, dest, intermediates);
    if (google) return google.distanceKm;

    if (isOsrmPricingEnabled()) {
        const osrm = await fetchOsrmRoute([origin, ...pts]);
        if (osrm) return osrm.distanceKm;
    }

    console.warn(`[distance-fallback] haversine×${ROAD_FACTOR} used for full route (${pts.length} stops)`);
    let total = 0;
    let prev = origin;
    for (const p of pts) {
        const leg = haversineKm(prev, p);
        if (leg != null) { total += leg; prev = p; }
    }
    return total * ROAD_FACTOR;
}

/**
 * Per-stop + total route distances for corridor pricing. Drop-in replacement
 * for the old OSRM-only resolveRouteDistances: always returns usable figures
 * when every stop has coordinates (thanks to the fallback chain), otherwise {}.
 */
export async function resolvePricingDistances(orderedStops, origin = KIGALI_HUB) {
    const coords = (orderedStops || []).map((s) => ({ lat: s?.lat ?? null, lng: s?.lng ?? null }));
    if (!coords.length || coords.some((c) => !validPoint(c))) return {};
    const [dropDistances, routeKm] = await Promise.all([
        routeMatrixKm(origin, coords),
        fullRouteKm(coords, origin),
    ]);
    if (dropDistances.every((d) => d != null) && routeKm > 0) {
        return { dropDistances, routeKm };
    }
    return {};
}
