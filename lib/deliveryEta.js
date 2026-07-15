// Kigali Pooled Delivery — distance & ETA helpers.
// Pure functions, safe to import on both server and client. No external routing API:
// ETA is a straight-line (haversine) estimate divided by an average Kigali road speed.
// Swap estimateEtaMinutes for an OSRM/Directions call later without touching callers.

// Warehouse / hub origin of every corridor route. Configurable via
// WAREHOUSE_LAT / WAREHOUSE_LNG (server-side env); defaults to the Kigali CBD /
// CHIC hub. Client bundles never see those vars, so the browser build keeps the
// default — all pricing/distance math runs server-side where the env applies.
const envNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const KIGALI_HUB = {
  lat: envNum(typeof process !== "undefined" ? process.env?.WAREHOUSE_LAT : null) ?? -1.9441,
  lng: envNum(typeof process !== "undefined" ? process.env?.WAREHOUSE_LNG : null) ?? 30.0619,
};

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

// ─── OSRM-backed pricing distances (opt-in) ─────────────────────────────────

// Use real road distances for delivery pricing when a (self-hosted) OSRM is set.
// Off by default → pricing uses the haversine straight-line distance.
export function isOsrmPricingEnabled() {
  return process.env.DELIVERY_OSRM_PRICING === "true";
}

/** Road distance (km) origin→dest via OSRM, or null on any failure. */
export async function roadDistanceKm(origin, dest, opts = {}) {
  const route = await fetchOsrmRoute([origin, dest], opts);
  return route ? route.distanceKm : null;
}

/**
 * Road distances (km) from a single origin to each of `points`, in ONE OSRM
 * `table` request. Returns an array aligned with `points`, or null on failure.
 */
export async function fetchOsrmTableDistances(origin, points, { timeoutMs = 5000 } = {}) {
  try {
    const list = [origin, ...(points || [])];
    if (list.some((p) => !p || p.lat == null || p.lng == null) || list.length < 2) return null;
    const coordStr = list.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${OSRM_URL}/table/v1/driving/${coordStr}?sources=0&annotations=distance`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;

    const data = await res.json();
    const row = data?.distances?.[0]; // metres from source 0 to each point (idx 0 = origin→origin)
    if (!Array.isArray(row)) return null;
    return row.slice(1).map((m) => (m == null ? null : m / 1000));
  } catch (_) {
    return null;
  }
}

/**
 * Resolve per-stop + total route distances for pricing. Returns
 * `{ dropDistances, routeKm }` when OSRM pricing is enabled and every stop has
 * coords; otherwise `{}` so callers fall back to the haversine path.
 */
export async function resolveRouteDistances(orderedStops, origin = KIGALI_HUB) {
  if (!isOsrmPricingEnabled()) return {};
  const coords = (orderedStops || []).map((s) => ({ lat: s?.lat ?? null, lng: s?.lng ?? null }));
  if (!coords.length || coords.some((c) => c.lat == null || c.lng == null)) return {};
  const [dropDistances, route] = await Promise.all([
    fetchOsrmTableDistances(origin, coords),
    fetchOsrmRoute([origin, ...coords]),
  ]);
  if (dropDistances && route) return { dropDistances, routeKm: route.distanceKm };
  return {};
}
