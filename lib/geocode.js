// Approximate geocoding for Rwandan addresses (village / sector / district level).
// Used as a fallback when the customer hasn't shared or pinned GPS coordinates:
// we resolve the *area* they described (down to the village/umudugudu) into an
// approximate point so distance-based delivery pricing and routing still work.
//
// Prefers the Google Geocoding API when PUBLIC_GOOGLE_MAPS_API_KEY is set (best
// coverage for Rwandan villages), and falls back to OSM Nominatim (free, no key).
// Server-side only. Failures return null — callers must treat coords as optional.

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
    return (await searchGoogle(query)) || (await searchNominatim(query));
}

/**
 * Geocode a Rwandan address described down to the village level. Tries the most
 * specific query first (village + sector + district), then progressively broader
 * ones, so a misspelled village still resolves to its sector/district centroid.
 *
 * @param {{village?:string, sector?:string, district?:string, province?:string}} parts
 * @returns {Promise<{lat:number,lng:number,precision:"village"|"sector"|"district"}|null>}
 */
export async function geocodeRwAddress({ village, sector, district, province } = {}) {
    const v = (village || "").trim();
    const s = (sector || "").trim();
    const d = (district || "").trim();
    const p = (province || "").trim();

    const attempts = [];
    if (v) attempts.push({ q: [v, s, d, p, "Rwanda"].filter(Boolean).join(", "), precision: "village" });
    if (s) attempts.push({ q: [s, d, p, "Rwanda"].filter(Boolean).join(", "), precision: "sector" });
    if (d) attempts.push({ q: [d, p, "Rwanda"].filter(Boolean).join(", "), precision: "district" });

    for (const attempt of attempts) {
        const hit = await searchAny(attempt.q);
        if (hit) return { ...hit, precision: attempt.precision };
    }
    return null;
}
