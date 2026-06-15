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

// ─── Route optimisation & proportional costing ──────────────────────────────

/**
 * Greedy nearest-neighbour ordering of stops starting from `origin` (the hub).
 * Returns a NEW array of the input points in visiting order. Points missing
 * coordinates are appended (in their original order) at the end.
 *
 * @param {{lat:number,lng:number}} origin
 * @param {Array<{lat:number,lng:number}>} points  any objects carrying lat/lng
 */
export function nearestNeighborRoute(origin, points) {
  if (!Array.isArray(points)) return [];
  const withCoords = points.filter((p) => p && p.lat != null && p.lng != null);
  const withoutCoords = points.filter((p) => !p || p.lat == null || p.lng == null);

  const remaining = [...withCoords];
  const ordered = [];
  let cursor = origin;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cursor, remaining[i]);
      if (d != null && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    cursor = next;
  }
  return [...ordered, ...withoutCoords];
}

/**
 * Split a fixed route cost across an *already ordered* list of stops, weighted by
 * each stop's cumulative road-distance from the origin (closest stop pays the
 * least, furthest pays the most). Falls back to an even split when distances are
 * unknown. Returns an array of fee shares aligned 1:1 with `orderedStops`.
 *
 * @param {{lat:number,lng:number}} origin
 * @param {Array<{lat:number,lng:number}>} orderedStops
 * @param {number} baseRouteCost
 */
export function proportionalFeeShares(origin, orderedStops, baseRouteCost) {
  const n = Array.isArray(orderedStops) ? orderedStops.length : 0;
  if (n === 0) return [];

  // Cumulative distance from the hub to each stop along the ordered route.
  const weights = [];
  let cursor = origin;
  let cumulative = 0;
  for (const stop of orderedStops) {
    const leg = haversineKm(cursor, stop);
    if (leg != null) {
      cumulative += leg;
      cursor = stop;
    }
    weights.push(cumulative);
  }

  const totalWeight = weights.reduce((s, w) => s + w, 0);
  // No usable geometry → even split.
  if (!(totalWeight > 0)) {
    const even = parseFloat((baseRouteCost / n).toFixed(2));
    return orderedStops.map(() => even);
  }
  return weights.map((w) => parseFloat(((w / totalWeight) * baseRouteCost).toFixed(2)));
}

// ─── OSRM road routing (real distance / duration / geometry) ────────────────

// Public demo server by default; set OSRM_URL to a self-hosted instance in prod.
const OSRM_URL = process.env.OSRM_URL || "https://router.project-osrm.org";

/**
 * Fetch a real driving route through the given ordered {lat,lng} waypoints.
 * Returns { distanceKm, durationMin, geometry:[[lat,lng]...] } or null on any
 * failure (caller should fall back to the haversine estimate).
 */
export async function fetchOsrmRoute(waypoints, { timeoutMs = 4000 } = {}) {
  try {
    const pts = (waypoints || []).filter((p) => p && p.lat != null && p.lng != null);
    if (pts.length < 2) return null;
    const coordStr = pts.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${OSRM_URL}/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    // GeoJSON coordinates are [lng,lat] → flip to [lat,lng] for Leaflet.
    const geometry = (route.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]);
    return {
      distanceKm: route.distance / 1000,
      durationMin: Math.max(1, Math.round(route.duration / 60)),
      geometry,
    };
  } catch (_) {
    return null;
  }
}
