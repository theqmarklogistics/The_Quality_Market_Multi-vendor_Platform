// Approximate geocoding for Rwandan addresses (village / sector / district level).
// Used as a fallback when the customer hasn't shared or pinned GPS coordinates:
// we resolve the *area* they described (down to the village/umudugudu) into an
// approximate point so distance-based delivery pricing and routing still work.
//
// Prefers the Google Geocoding API when PUBLIC_GOOGLE_MAPS_API_KEY is set (best
// coverage for Rwandan villages), and falls back to OSM Nominatim (free, no key).
// Results are cached in the GeocodeCache table by normalized address string so
// the same address never re-bills the paid API.
// Server-side only. Failures return null — callers must treat coords as optional.
import prisma from "./prisma.js";

const GOOGLE_KEY = process.env.PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
const NOMINATIM_URL = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
const USER_AGENT = "TheQualityMarket/1.0 (delivery-distance; thequalitymarket.com)";

async function fetchJson(url, { timeoutMs = 4000, headers } = {}) {
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal, headers });
        clearTimeout(t);
        if (!res.ok) return null;
        return await res.json();
    } catch (_) {
        return null;
    }
}

async function searchGoogle(query) {
    if (!GOOGLE_KEY) return null;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=rw&components=country:RW&key=${GOOGLE_KEY}`;
    const data = await fetchJson(url);
    const loc = data?.status === "OK" ? data.results?.[0]?.geometry?.location : null;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
    return { lat: loc.lat, lng: loc.lng };
}

async function searchNominatim(query) {
    const url = `${NOMINATIM_URL}/search?format=json&limit=1&countrycodes=rw&q=${encodeURIComponent(query)}`;
    const data = await fetchJson(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" } });
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit?.lat || !hit?.lon) return null;
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
}

async function searchAny(query) {
    const google = await searchGoogle(query);
    if (google) return { ...google, provider: "google" };
    const nominatim = await searchNominatim(query);
    if (nominatim) return { ...nominatim, provider: "nominatim" };
    return null;
}

/** Normalized cache key for an address query (case/whitespace-insensitive). */
export function normalizeGeoQuery({ village, sector, district, province } = {}) {
    return [village, sector, district, province]
        .map((part) => (part || "").trim().toLowerCase().replace(/\s+/g, " "))
        .join("|");
}

async function cacheLookup(key) {
    try {
        const hit = await prisma.geocodeCache.findUnique({ where: { query: key } });
        if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
            return { lat: hit.lat, lng: hit.lng, precision: hit.precision || undefined };
        }
    } catch (_) { /* cache table missing / DB hiccup — fall through to live lookup */ }
    return null;
}

function cacheStore(key, { lat, lng, precision, provider }) {
    prisma.geocodeCache
        .upsert({
            where: { query: key },
            update: { lat, lng, precision: precision || null, provider: provider || null },
            create: { query: key, lat, lng, precision: precision || null, provider: provider || null },
        })
        .catch(() => { /* best-effort */ });
}

/**
 * Geocode a Rwandan address described down to the village level. Tries the most
 * specific query first (village + sector + district), then progressively broader
 * ones, so a misspelled village still resolves to its sector/district centroid.
 * Cached by normalized address string to avoid repeat API billing.
 *
 * @param {{village?:string, sector?:string, district?:string, province?:string}} parts
 * @returns {Promise<{lat:number,lng:number,precision:"village"|"sector"|"district"}|null>}
 */
export async function geocodeRwAddress({ village, sector, district, province } = {}) {
    const v = (village || "").trim();
    const s = (sector || "").trim();
    const d = (district || "").trim();
    const p = (province || "").trim();

    const cacheKey = normalizeGeoQuery({ village: v, sector: s, district: d, province: p });
    if (cacheKey !== "|||") {
        const cached = await cacheLookup(cacheKey);
        if (cached) return cached;
    }

    const attempts = [];
    if (v) attempts.push({ q: [v, s, d, p, "Rwanda"].filter(Boolean).join(", "), precision: "village" });
    if (s) attempts.push({ q: [s, d, p, "Rwanda"].filter(Boolean).join(", "), precision: "sector" });
    if (d) attempts.push({ q: [d, p, "Rwanda"].filter(Boolean).join(", "), precision: "district" });

    for (const attempt of attempts) {
        const hit = await searchAny(attempt.q);
        if (hit) {
            const result = { lat: hit.lat, lng: hit.lng, precision: attempt.precision };
            if (cacheKey !== "|||") cacheStore(cacheKey, { ...result, provider: hit.provider });
            return result;
        }
    }
    return null;
}
