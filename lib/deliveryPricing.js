// Segmented distance-taper + weight-range shipping pricing.
// Applies to every paid delivery: standard, Kigali pooled, and external bookings.
//
//   greaterWeight = max(actualKg, volumetricKg)
//   chargeableWt  = weightRangeLookup(greaterWeight)      // null ⇒ needs manual review
//   effectiveDist = Σ per taperStepKm segment: segLen × max(taperFloorPct, 1 − i·taperDropPerStep)
//   fee           = max(minimumFloor, round(baseRatePerKgKm × chargeableWt × effectiveDist))
//
// The per-km rate holds at 100% for the first step, drops taperDropPerStep every
// subsequent step, and never falls below taperFloorPct — so the fee is a
// summation across distance segments, not one multiplier on the total.
//
// Pure functions (server + client safe). Distance is passed in / derived by callers.
import { haversineKm, KIGALI_HUB } from "./deliveryEta.js";

export const DEFAULTS = {
    baseRatePerKgKm: 8,      // RWF per km · chargeable-weight unit
    expressBaseRatePerKgKm: 16, // express uses its own (higher) base rate
    minimumFloor: 2000,      // RWF global floor for short/light trips
    volumetricFactor: 200,   // kg per 1 m³ (1 CBM = 200 kg)
    taperStepKm: 5,          // km per taper step
    taperDropPerStep: 0.10,  // fractional rate reduction per step (10%)
    taperFloorPct: 0.50,     // minimum multiplier the taper decays to (50%)
};

function numOr(v, fallback) {
    return Number.isFinite(v) && v > 0 ? v : fallback;
}
function nonNegOr(v, fallback) {
    return Number.isFinite(v) && v >= 0 ? v : fallback;
}
const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));

// Normalise a raw ExternalDeliveryConfig row into the numbers the formula needs.
export function resolvePricingConfig(config = {}) {
    return {
        baseRatePerKgKm: numOr(config?.baseRatePerKgKm, DEFAULTS.baseRatePerKgKm),
        expressBaseRatePerKgKm: numOr(config?.expressBaseRatePerKgKm, DEFAULTS.expressBaseRatePerKgKm),
        minimumFloor: nonNegOr(config?.minimumFloor, DEFAULTS.minimumFloor),
        volumetricFactor: numOr(config?.volumetricFactor, DEFAULTS.volumetricFactor),
        taperStepKm: numOr(config?.taperStepKm, DEFAULTS.taperStepKm),
        taperDropPerStep: nonNegOr(config?.taperDropPerStep, DEFAULTS.taperDropPerStep),
        taperFloorPct: numOr(config?.taperFloorPct, DEFAULTS.taperFloorPct),
    };
}

// Volumetric weight: 1 m³ = `volumetricFactor` kg. With L×W×H in cm,
// volumeKg = (L·W·H) / (1_000_000 / factor) → factor 200 ⇒ ÷5000.
export function volumetricWeightKg(l, w, h, volumetricFactor = DEFAULTS.volumetricFactor) {
    if (!l || !w || !h || !(volumetricFactor > 0)) return 0;
    const divisor = 1_000_000 / volumetricFactor;
    return (l * w * h) / divisor;
}

// The weight the fee is based on = max(actual, volumetric).
export function chargeableWeightKg(actualKg, l, w, h, volumetricFactor = DEFAULTS.volumetricFactor) {
    const actual = Number.isFinite(actualKg) && actualKg > 0 ? actualKg : 0;
    return Math.max(actual, volumetricWeightKg(l, w, h, volumetricFactor));
}

// Small util: round a weight UP to the nearest 0.5 kg (kept for display/tests).
export function roundUpToHalfKg(kg) {
    const n = Number(kg);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.ceil(n * 2) / 2;
}

/**
 * Look up the CHARGEABLE weight value for a package's greater weight in the
 * admin weight-range table. Convention mirrors lib/pricing.lookupWeightZoneRate:
 * a range matches when minWeightKg ≤ weight ≤ maxWeightKg (open top tier:
 * maxWeightKg null); on a boundary the higher range wins (largest matching
 * minWeightKg). Returns the range's chargeableKg, or null when nothing covers
 * the weight (⇒ manual review).
 *
 * @param {number} greaterWeightKg
 * @param {Array<{minWeightKg:number, maxWeightKg:number|null, chargeableKg:number}>} ranges
 */
export function lookupWeightRange(greaterWeightKg, ranges = []) {
    const w = Number(greaterWeightKg);
    if (!Number.isFinite(w) || w <= 0) return null;
    if (!Array.isArray(ranges) || !ranges.length) return null;
    let best = null;
    for (const r of ranges) {
        const min = Number(r?.minWeightKg);
        if (!Number.isFinite(min) || w < min) continue;
        const max = r?.maxWeightKg;
        if (max != null && Number.isFinite(Number(max)) && w > Number(max)) continue;
        if (!best || min > Number(best.minWeightKg)) best = r;
    }
    if (!best) return null;
    const val = Number(best.chargeableKg);
    return Number.isFinite(val) && val > 0 ? val : null;
}

/**
 * Effective distance units after the per-segment taper. Returns Σ(segLen × pct)
 * where the first `taperStepKm` segment is 100%, each next step drops
 * `taperDropPerStep`, floored at `taperFloorPct`.
 */
export function taperFactor(distanceKm, config = {}) {
    const c = resolvePricingConfig(config);
    const step = c.taperStepKm > 0 ? c.taperStepKm : DEFAULTS.taperStepKm;
    const floor = Math.min(1, Math.max(0, c.taperFloorPct));
    const drop = Math.max(0, c.taperDropPerStep);
    let remaining = Math.max(0, Number(distanceKm) || 0);
    let i = 0;
    let total = 0;
    while (remaining > 1e-9) {
        const seg = Math.min(step, remaining);
        const pct = Math.max(floor, 1 - i * drop);
        total += seg * pct;
        remaining -= seg;
        i += 1;
    }
    return total;
}

/**
 * The one shipping-fee formula. Supply either a precomputed `greaterWeightKg`,
 * or `actualKg` + dimensions (volumetric is derived). `ranges` is the admin
 * weight-range table. Returns `{ needsReview:true, fee:null }` when the greater
 * weight falls outside every configured range — the caller then alerts admin
 * instead of auto-charging.
 *
 * @returns {{fee:number|null, needsReview:boolean, actualKg:number,
 *            volumetricKg:number, greaterWeightKg:number,
 *            chargeableWeightUsed:number|null, effectiveDist:number|null}}
 */
export function computeShippingFee({
    actualKg, lengthCm, widthCm, heightCm,
    greaterWeightKg, volumetricKg,
    distanceKm, ranges = [], config = {},
    express = false,
} = {}) {
    const c = resolvePricingConfig(config);
    const vol = Number.isFinite(volumetricKg) && volumetricKg >= 0
        ? volumetricKg
        : volumetricWeightKg(lengthCm, widthCm, heightCm, c.volumetricFactor);
    const actual = Number.isFinite(actualKg) && actualKg > 0 ? actualKg : 0;
    const greater = Number.isFinite(greaterWeightKg) && greaterWeightKg > 0
        ? greaterWeightKg
        : Math.max(actual, vol);

    const base = {
        actualKg: round2(actual),
        volumetricKg: round2(vol),
        greaterWeightKg: round2(greater),
    };

    const chargeable = lookupWeightRange(greater, ranges);
    if (chargeable == null) {
        return { ...base, fee: null, needsReview: true, chargeableWeightUsed: null, effectiveDist: null };
    }

    const eff = taperFactor(distanceKm, c);
    // Express rides the same formula with its own (higher) base rate.
    const rate = express ? c.expressBaseRatePerKgKm : c.baseRatePerKgKm;
    const raw = rate * chargeable * eff;
    const fee = Math.max(Math.round(c.minimumFloor), Math.round(raw));
    return { ...base, fee, needsReview: false, chargeableWeightUsed: chargeable, effectiveDist: round2(eff) };
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
 * Price one corridor and split it across drops. Each drop is priced with the
 * standalone formula (max(floor, …)) from its own distance + weight, so a
 * single-stop corridor prices identically to a solo booking and Σ shares equals
 * the route price. Pooling savings, when offered, come from corridor lane
 * overrides (CorridorRoute.fixedRate/perKmRate), not from this formula.
 *
 * @param {Array<{greaterWeightKg?:number, chargeableKg?:number, lat:number|null, lng:number|null}>} orderedStops
 *        each stop carries the GREATER of its actual/volumetric weight (in
 *        `greaterWeightKg`, or legacy `chargeableKg`) plus coords.
 * @param {object} config  raw ExternalDeliveryConfig row (or {} for defaults)
 * @param {Array} ranges   admin weight ranges for the chargeable-weight lookup
 * @param {{lat:number,lng:number}} origin
 * @param {{dropDistances?:number[], routeKm?:number}} [opts]
 * @returns {{ routePrice:number, shares:number[], routeDistanceKm:number, loads:number[] }}
 *          `shares`/`loads` align 1:1 with `orderedStops`; Σ shares === routePrice.
 */
export function computeRouteShares(orderedStops, config, ranges = [], origin = KIGALI_HUB, opts = {}) {
    const c = resolvePricingConfig(config);
    const n = Array.isArray(orderedStops) ? orderedStops.length : 0;
    if (n === 0) return { routePrice: 0, shares: [], routeDistanceKm: 0, loads: [] };

    const dropDistances = Array.isArray(opts?.dropDistances) && opts.dropDistances.length === n
        ? opts.dropDistances
        : null;

    // Per-drop standalone fee. A drop whose weight is out of range or that has no
    // usable distance contributes 0 (resolved via manual review / staff override).
    const fees = orderedStops.map((s, i) => {
        const greater = Math.max(0, Number(s?.greaterWeightKg ?? s?.chargeableKg) || 0);
        const dist = dropDistances
            ? Math.max(0, Number(dropDistances[i]) || 0)
            : ((s && s.lat != null && s.lng != null) ? (haversineKm(origin, { lat: s.lat, lng: s.lng }) ?? 0) : 0);
        const q = computeShippingFee({ greaterWeightKg: greater, distanceKm: dist, ranges, config: c });
        return q.needsReview || q.fee == null ? 0 : q.fee;
    });
    const totalFee = fees.reduce((sum, f) => sum + f, 0);

    const routeKm = Number.isFinite(opts?.routeKm) ? opts.routeKm : routeDistanceKm(orderedStops, origin);
    const routePrice = Math.max(Math.round(c.minimumFloor), Math.round(totalFee));

    // Split by each drop's own fee; no priced drops → even split.
    const shares = splitByRatio(routePrice, totalFee > 0 ? fees : orderedStops.map(() => 1));
    return { routePrice, shares, routeDistanceKm: routeKm, loads: fees };
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
