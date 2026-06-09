// Kigali Pooled Delivery — distance & ETA helpers.
// Pure functions, safe to import on both server and client. No external routing API:
// ETA is a straight-line (haversine) estimate divided by an average Kigali road speed.
// Swap estimateEtaMinutes for an OSRM/Directions call later without touching callers.

// Kigali CBD / CHIC hub — origin of every corridor route.
export const KIGALI_HUB = { lat: -1.9441, lng: 30.0619 };

// Average effective speed across Kigali traffic (km/h). Tunable.
const AVG_SPEED_KMH = 18;
const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two {lat,lng} points, in kilometres. */
export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
    return null;
  }
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Estimate minutes until the rider reaches `target`, travelling through the
 * `remainingStops` (ordered) that come before it along the corridor route.
 *
 * @param {{lat:number,lng:number}|null} riderPos   current rider position
 * @param {Array<{lat:number,lng:number}>} legStops  ordered stops from rider up to & including target
 * @param {number} [avgSpeedKmh]
 * @returns {number|null} estimated minutes, or null if positions unknown
 */
export function estimateEtaMinutes(riderPos, legStops, avgSpeedKmh = AVG_SPEED_KMH) {
  if (!riderPos || !Array.isArray(legStops) || legStops.length === 0) return null;
  let totalKm = 0;
  let prev = riderPos;
  for (const stop of legStops) {
    const d = haversineKm(prev, stop);
    if (d == null) return null;
    totalKm += d;
    prev = stop;
  }
  const minutes = (totalKm / avgSpeedKmh) * 60;
  return Math.max(1, Math.round(minutes));
}

/**
 * Build the ordered list of stop coordinates the rider must pass to reach the
 * target order, then estimate ETA. `stops` are corridor orders with
 * {stopSequence, lat, lng}; only those with sequence <= target's are counted.
 */
export function estimateEtaForStop(riderPos, stops, targetSequence) {
  if (!riderPos || !Array.isArray(stops)) return null;
  const legStops = stops
    .filter((s) => s.lat != null && s.lng != null && s.stopSequence != null && s.stopSequence <= targetSequence)
    .sort((a, b) => a.stopSequence - b.stopSequence)
    .map((s) => ({ lat: s.lat, lng: s.lng }));
  if (legStops.length === 0) return null;
  return estimateEtaMinutes(riderPos, legStops);
}
