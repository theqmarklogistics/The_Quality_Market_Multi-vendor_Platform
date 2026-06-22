// Distance + weight pricing for pooled / external delivery.
//
// Fee = max(minimumFloor, round(baseRatePerKgKm × chargeableKg × distanceKm × tierMultiplier))
//
// Pure functions (server + client safe). Distance is passed in / derived via the
// haversine helper today; an OSRM road distance can be swapped in later without
// touching callers.
import { haversineKm, KIGALI_HUB } from "./deliveryEta.js";

// Fallback sliding-scale tiers when none are configured. Longer routes get a
// smaller multiplier (volume efficiency on long journeys); the floor keeps short
// trips profitable. Open final tier uses maxKm:null.
export const DEFAULT_TIERS = [
    { maxKm: 5, multiplier: 1.0 },
    { maxKm: 10, multiplier: 0.85 },
    { maxKm: 20, multiplier: 0.7 },
    { maxKm: null, multiplier: 0.6 },
];

export const DEFAULTS = {
    baseRatePerKgKm: 8, // RWF per kg·km
    minimumFloor: 2000, // RWF
    volumetricFactor: 200, // kg per 1 m³ (1 CBM = 200 kg)
};

function numOr(v, fallback) {
    return Number.isFinite(v) && v > 0 ? v : fallback;
}

// Normalise a raw ExternalDeliveryConfig row into the numbers the formula needs.
export function resolvePricingConfig(config = {}) {
    const rawTiers = Array.isArray(config?.distanceTiers) && config.distanceTiers.length
        ? [...config.distanceTiers]
        : DEFAULT_TIERS;
    // Ascending by maxKm; the open tier (null) always sorts last.
    rawTiers.sort((a, b) => {
        if (a?.maxKm == null) return 1;
        if (b?.maxKm == null) return -1;
        return a.maxKm - b.maxKm;
    });
    return {
        baseRatePerKgKm: numOr(config?.baseRatePerKgKm, DEFAULTS.baseRatePerKgKm),
        minimumFloor: numOr(config?.minimumFloor, DEFAULTS.minimumFloor),
        volumetricFactor: numOr(config?.volumetricFactor, DEFAULTS.volumetricFactor),
        tiers: rawTiers,
    };
}

// Volumetric weight: 1 m³ = `volumetricFactor` kg. With L×W×H in cm,
// volumeKg = (L·W·H) / (1_000_000 / factor) → factor 200 ⇒ ÷5000.
export function volumetricWeightKg(l, w, h, volumetricFactor = DEFAULTS.volumetricFactor) {
    if (!l || !w || !h || !(volumetricFactor > 0)) return 0;
    const divisor = 1_000_000 / volumetricFactor;
    return (l * w * h) / divisor;
}

// Chargeable weight = max(actual, volumetric).
export function chargeableWeightKg(actualKg, l, w, h, volumetricFactor = DEFAULTS.volumetricFactor) {
    const actual = Number.isFinite(actualKg) && actualKg > 0 ? actualKg : 0;
    return Math.max(actual, volumetricWeightKg(l, w, h, volumetricFactor));
}

// Tier multiplier for a distance. First tier whose maxKm ≥ distance wins;
// otherwise the open (maxKm:null) tier; else 1.
export function tierMultiplier(distanceKm, tiers = DEFAULT_TIERS) {
    const list = Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_TIERS;
    for (const t of list) {
        if (t?.maxKm == null) return numOr(t?.multiplier, 1);
        if (distanceKm <= t.maxKm) return numOr(t?.multiplier, 1);
    }
    return numOr(list[list.length - 1]?.multiplier, 1);
}

/**
 * Standalone fee for a single drop — the booking quote (a batch of one).
 * Fee = max(floor, round(baseRate × chargeableKg × distanceKm × multiplier(distanceKm))).
 */
export function quoteStandaloneFee({ chargeableKg, distanceKm, config }) {
    const c = resolvePricingConfig(config);
    const kg = Math.max(0, Number(chargeableKg) || 0);
    const dist = Math.max(0, Number(distanceKm) || 0);
    const raw = c.baseRatePerKgKm * kg * dist * tierMultiplier(dist, c.tiers);
    return Math.max(Math.round(c.minimumFloor), Math.round(raw));
}

/**
 * Total straight-line route length through ordered stops from the origin (hub).
 * stops: [{ lat, lng }] already in visiting order; missing coords are skipped.
 */
export function routeDistanceKm(orderedStops, origin = KIGALI_HUB) {
    if (!Array.isArray(orderedStops) || !orderedStops.length) return 0;
    let total = 0;
    let prev = origin;
    for (const s of orderedStops) {
        if (s == null || s.lat == null || s.lng == null) continue;
        const d = haversineKm(prev, { lat: s.lat, lng: s.lng });
        if (d != null) { total += d; prev = { lat: s.lat, lng: s.lng }; }
    }
    return total;
}

/**
 * Price one corridor and split it across drops by (chargeableKg × dropDistance).
 *
 * @param {Array<{chargeableKg:number, lat:number|null, lng:number|null}>} orderedStops
 *        stops in visiting order, each carrying its chargeable weight + coords.
 * @param {object} config  raw ExternalDeliveryConfig row (or {} for defaults)
 * @param {{lat:number,lng:number}} origin
 * @param {{dropDistances?:number[], routeKm?:number}} [opts]
 *        precomputed road distances (e.g. OSRM); when omitted, haversine is used.
 * @returns {{ routePrice:number, shares:number[], routeDistanceKm:number, loads:number[] }}
 *          `shares`/`loads` align 1:1 with `orderedStops`; Σ shares === routePrice.
 */
export function computeRouteShares(orderedStops, config, origin = KIGALI_HUB, opts = {}) {
    const c = resolvePricingConfig(config);
    const n = Array.isArray(orderedStops) ? orderedStops.length : 0;
    if (n === 0) return { routePrice: 0, shares: [], routeDistanceKm: 0, loads: [] };

    const dropDistances = Array.isArray(opts?.dropDistances) && opts.dropDistances.length === n
        ? opts.dropDistances
        : null;

    // Per-drop load = chargeableKg × hub→drop distance (road distance when supplied).
    const loads = orderedStops.map((s, i) => {
        const kg = Math.max(0, Number(s?.chargeableKg) || 0);
        const dist = dropDistances
            ? Math.max(0, Number(dropDistances[i]) || 0)
            : ((s && s.lat != null && s.lng != null) ? (haversineKm(origin, { lat: s.lat, lng: s.lng }) ?? 0) : 0);
        return kg * dist;
    });
    const totalLoad = loads.reduce((sum, l) => sum + l, 0);

    const routeKm = Number.isFinite(opts?.routeKm) ? opts.routeKm : routeDistanceKm(orderedStops, origin);
    const multiplier = tierMultiplier(routeKm, c.tiers);
    const routePrice = Math.max(
        Math.round(c.minimumFloor),
        Math.round(c.baseRatePerKgKm * totalLoad * multiplier)
    );

    // Split by load ratio; no usable load (no weight/coords) → even split.
    const shares = splitByRatio(routePrice, totalLoad > 0 ? loads : orderedStops.map(() => 1));
    return { routePrice, shares, routeDistanceKm: routeKm, loads };
}

/**
 * Integer-split `total` proportional to `weights`, reconciled by largest remainder
 * so the parts sum exactly to `total`.
 */
export function splitByRatio(total, weights) {
    const n = weights.length;
    if (n === 0) return [];
    const sum = weights.reduce((s, w) => s + w, 0);
    if (!(sum > 0)) {
        const base = Math.floor(total / n);
        const out = new Array(n).fill(base);
        const rem = total - base * n;
        for (let i = 0; i < rem; i++) out[i] += 1;
        return out;
    }
    const exact = weights.map((w) => (w / sum) * total);
    const out = exact.map((x) => Math.floor(x));
    const remainder = total - out.reduce((s, x) => s + x, 0);
    const order = exact
        .map((x, i) => ({ i, frac: x - Math.floor(x) }))
        .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remainder; k++) out[order[k % n].i] += 1;
    return out;
}
