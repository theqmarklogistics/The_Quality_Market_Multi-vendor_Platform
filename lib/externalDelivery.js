import prisma from "@/lib/prisma";
import { chargeableWeightKg, volumetricWeightKg, computeShippingFee } from "@/lib/deliveryPricing";
import { KIGALI_HUB } from "@/lib/deliveryEta";
import { routeDistanceKm } from "@/lib/distanceProvider";

const DEFAULT_BASE_PRICE = 2000; // RWF, used as the flat fallback fee

// Sanity ceiling for the distance-based formula. The farthest domestic drop
// from Kigali is < ~350 km by road; a computed distance beyond this means the
// drop coordinates are bogus (e.g. a (0,0) "Null Island" pin), so the fee must
// go to manual review instead of auto-charging a nonsense amount.
const MAX_FORMULA_DISTANCE_KM = 400;

// Load the singleton external-delivery pricing config, creating it on first use.
// Rate columns (baseRatePerKgKm, minimumFloor, volumetricFactor, taper*) carry
// DB defaults, so the minimal create() below still produces a valid row.
export async function getExternalDeliveryConfig() {
    let config = await prisma.externalDeliveryConfig.findUnique({ where: { id: "default" } });
    if (!config) {
        config = await prisma.externalDeliveryConfig.create({
            data: { id: "default", basePrice: DEFAULT_BASE_PRICE, perSector: {} },
        });
    }
    return config;
}

// Legacy flat/per-sector price — the fallback when distance is unknown.
export function flatSectorFee(config, sector) {
    const perSector = config.perSector && typeof config.perSector === "object" ? config.perSector : {};
    const override = sector ? perSector[sector] : null;
    const price = Number.isFinite(override) && override > 0 ? override : config.basePrice;
    return parseFloat(Number(price ?? DEFAULT_BASE_PRICE).toFixed(2));
}

const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));

// ── Weight ranges ────────────────────────────────────────────────────────────
// Admin-defined kg brackets → chargeable-weight value. Change rarely → cached in
// process for 5 minutes, invalidated from the admin weight-range mutation route.
const WEIGHT_RANGE_TTL_MS = 5 * 60 * 1000;
let weightRangeCache = { value: null, expiresAt: 0 };

export function invalidateWeightRangeCache() {
    weightRangeCache = { value: null, expiresAt: 0 };
}

export async function getWeightRanges() {
    if (weightRangeCache.value && Date.now() < weightRangeCache.expiresAt) {
        return weightRangeCache.value;
    }
    try {
        const rows = await prisma.deliveryWeightRange.findMany({
            orderBy: { minWeightKg: "asc" },
            select: { minWeightKg: true, maxWeightKg: true, chargeableKg: true },
        });
        weightRangeCache = { value: rows, expiresAt: Date.now() + WEIGHT_RANGE_TTL_MS };
        return rows;
    } catch (_) {
        return weightRangeCache.value || [];
    }
}

// ── Corridor lane pricing ────────────────────────────────────────────────────
// An active CorridorRoute with a fixed or per-km rate overrides the formula fee
// for drops whose sector appears in the corridor's `areas`. Corridors change
// rarely (admin only) → 5-minute in-process cache, invalidated from the admin
// corridor mutation routes.
const CORRIDOR_TTL_MS = 5 * 60 * 1000;
let corridorRateCache = { value: null, expiresAt: 0 };

export function invalidateCorridorRateCache() {
    corridorRateCache = { value: null, expiresAt: 0 };
}

async function getRatedCorridors() {
    if (corridorRateCache.value && Date.now() < corridorRateCache.expiresAt) {
        return corridorRateCache.value;
    }
    try {
        const rows = await prisma.corridorRoute.findMany({
            where: { isActive: true, OR: [{ fixedRate: { not: null } }, { perKmRate: { not: null } }] },
            select: { areas: true, fixedRate: true, perKmRate: true },
        });
        corridorRateCache = { value: rows, expiresAt: Date.now() + CORRIDOR_TTL_MS };
        return rows;
    } catch (_) {
        return corridorRateCache.value || [];
    }
}

/**
 * Corridor rate for a drop, or null when no rated corridor covers its sector.
 * Fixed rate wins; a per-km rate needs a usable road distance and is floored
 * at the config minimum so a short hop never underprices the trip.
 */
async function corridorFeeOverride(sector, distanceKm, config) {
    const norm = (sector || "").trim().toLowerCase();
    if (!norm) return null;
    const corridors = await getRatedCorridors();
    const match = corridors.find((c) => (c.areas || []).some((a) => String(a).trim().toLowerCase() === norm));
    if (!match) return null;
    if (Number.isFinite(match.fixedRate) && match.fixedRate > 0) {
        return Math.round(match.fixedRate);
    }
    if (Number.isFinite(match.perKmRate) && match.perKmRate > 0 && Number.isFinite(distanceKm) && distanceKm > 0) {
        return Math.max(Math.round(config?.minimumFloor ?? DEFAULT_BASE_PRICE), Math.round(match.perKmRate * distanceKm));
    }
    return null;
}

/**
 * Published delivery fee charged at booking (priced as a batch of one). Uses the
 * segmented distance-taper + weight-range formula when distance is known,
 * otherwise falls back to the flat/per-sector price.
 *
 * When the greater of the package's actual/volumetric weight falls outside every
 * configured weight range, the fee cannot be auto-computed: this returns
 * `{ needsReview: true, fee: null }` so the caller flags the order and alerts
 * admin to contact the customer.
 *
 * @param {object|string} opts  { sector, distanceKm?, dropLat?, dropLng?,
 *                                originLat?, originLng?, express?,
 *                                weightKg?, lengthCm?, widthCm?, heightCm? }
 *                                — or a bare sector string (legacy callers).
 *                                `express: true` prices with the express base
 *                                rate (instant dispatch — corridor lane rates
 *                                don't apply since express skips corridors).
 * @returns {Promise<{fee:number|null, needsReview:boolean, express:boolean, actualKg:number,
 *          volumetricKg:number, greaterWeightKg:number, chargeableKg:number,
 *          chargeableWeightUsed:number|null, distanceKm:number|null, basis:string}>}
 */
export async function quoteExternalDeliveryFee(opts = {}) {
    const o = typeof opts === "string" ? { sector: opts } : (opts || {});
    const express = !!o.express;
    const config = await getExternalDeliveryConfig();
    const factor = config.volumetricFactor ?? 200;

    // Distance origin: an explicit pickup/rider point wins over the hub.
    const origin = (Number.isFinite(o.originLat) && Number.isFinite(o.originLng))
        ? { lat: o.originLat, lng: o.originLng }
        : KIGALI_HUB;

    // Distance: explicit km wins; else derive from a drop pin via the road
    // distance provider chain (cache → Google Routes → OSRM → haversine×factor).
    let distanceKm = Number.isFinite(o.distanceKm) ? o.distanceKm : null;
    if (distanceKm == null && o.dropLat != null && o.dropLng != null) {
        distanceKm = await routeDistanceKm(origin, { lat: o.dropLat, lng: o.dropLng });
    }

    const actualKg = Number.isFinite(o.weightKg) && o.weightKg > 0 ? o.weightKg : 0;
    const volKg = volumetricWeightKg(o.lengthCm, o.widthCm, o.heightCm, factor);
    const greaterWeightKg = Math.max(actualKg, volKg);

    const base = {
        actualKg: round2(actualKg),
        volumetricKg: round2(volKg),
        greaterWeightKg: round2(greaterWeightKg),
        chargeableKg: round2(greaterWeightKg), // back-compat alias
        distanceKm: distanceKm != null ? round2(distanceKm) : null,
        express,
    };

    // 1) Corridor lane rate wins when one covers the drop's sector — but never
    //    for express: express skips corridors, so lane pricing doesn't apply.
    if (!express) {
        const corridorFee = await corridorFeeOverride(o.sector, distanceKm, config);
        if (corridorFee != null) {
            return { ...base, fee: corridorFee, needsReview: false, chargeableWeightUsed: null, basis: "corridor" };
        }
    }

    // Implausible distance ⇒ bad coordinates; flag for manual review rather
    // than pricing a trip that cannot exist.
    if (distanceKm != null && distanceKm > MAX_FORMULA_DISTANCE_KM) {
        return { ...base, fee: null, needsReview: true, chargeableWeightUsed: null, basis: "needs_review" };
    }

    // 2) Segmented formula — needs a distance + an in-range weight.
    if (distanceKm != null && distanceKm > 0 && greaterWeightKg > 0) {
        const ranges = await getWeightRanges();
        const q = computeShippingFee({ greaterWeightKg, volumetricKg: volKg, actualKg, distanceKm, ranges, config, express });
        if (q.needsReview) {
            return { ...base, fee: null, needsReview: true, chargeableWeightUsed: null, basis: "needs_review" };
        }
        return { ...base, fee: q.fee, needsReview: false, chargeableWeightUsed: q.chargeableWeightUsed, basis: "formula" };
    }

    // 3) Flat/per-sector fallback (distance unknown).
    return { ...base, fee: flatSectorFee(config, o.sector), needsReview: false, chargeableWeightUsed: null, basis: "flat" };
}

/**
 * Delivery fee for a cart of items (batch of one — the checkout charge for both
 * standard and pooled delivery). Items without weight/dimension data still
 * occupy the rider, so they bill at 1 kg per unit. Falls back to the flat/
 * per-sector price when no drop point is known. Used by checkout (order
 * creation + live quote) and the pool-quote API.
 *
 * @returns {Promise<{fee:number|null, needsReview:boolean, actualKg:number,
 *          volumetricKg:number, greaterWeightKg:number, chargeableKg:number,
 *          chargeableWeightUsed:number|null, distanceKm:number|null, basis:string}>}
 */
export async function quotePooledCartFee({ items = [], lat = null, lng = null, sector = null, originLat = null, originLng = null, express = false } = {}) {
    const config = await getExternalDeliveryConfig();
    const factor = config.volumetricFactor ?? 200;

    // Aggregate the cart's actual + volumetric weight; the greater of the two is
    // the weight looked up in the ranges. Weightless items bill at 1 kg/unit.
    let actualKg = 0;
    let volKg = 0;
    for (const item of items) {
        const qty = Math.max(1, parseInt(item?.quantity, 10) || 1);
        const a = Number.isFinite(item?.weightKg) && item.weightKg > 0 ? item.weightKg : 0;
        const v = volumetricWeightKg(item?.lengthCm, item?.widthCm, item?.heightCm, factor);
        const perUnit = chargeableWeightKg(item?.weightKg, item?.lengthCm, item?.widthCm, item?.heightCm, factor);
        // Fall back to 1 kg/unit only when the item carries no usable weight at all.
        if (perUnit > 0) {
            actualKg += a * qty;
            volKg += v * qty;
        } else {
            actualKg += 1 * qty;
        }
    }
    const greaterWeightKg = Math.max(actualKg, volKg);

    const origin = (Number.isFinite(originLat) && Number.isFinite(originLng))
        ? { lat: originLat, lng: originLng }
        : KIGALI_HUB;

    let distanceKm = null;
    if (lat != null && lng != null) {
        distanceKm = await routeDistanceKm(origin, { lat, lng });
    }

    const base = {
        actualKg: round2(actualKg),
        volumetricKg: round2(volKg),
        greaterWeightKg: round2(greaterWeightKg),
        chargeableKg: round2(greaterWeightKg), // back-compat alias
        distanceKm: distanceKm != null ? round2(distanceKm) : null,
        express,
    };

    // Same precedence as quoteExternalDeliveryFee: corridor rate (never for
    // express — it skips corridors) → formula → flat.
    if (!express) {
        const corridorFee = await corridorFeeOverride(sector, distanceKm, config);
        if (corridorFee != null) {
            return { ...base, fee: corridorFee, needsReview: false, chargeableWeightUsed: null, basis: "corridor" };
        }
    }

    // Implausible distance ⇒ bad coordinates; flag for manual review rather
    // than pricing a trip that cannot exist.
    if (distanceKm != null && distanceKm > MAX_FORMULA_DISTANCE_KM) {
        return { ...base, fee: null, needsReview: true, chargeableWeightUsed: null, basis: "needs_review" };
    }

    if (distanceKm != null && distanceKm > 0 && greaterWeightKg > 0) {
        const ranges = await getWeightRanges();
        const q = computeShippingFee({ greaterWeightKg, volumetricKg: volKg, actualKg, distanceKm, ranges, config, express });
        if (q.needsReview) {
            return { ...base, fee: null, needsReview: true, chargeableWeightUsed: null, basis: "needs_review" };
        }
        return { ...base, fee: q.fee, needsReview: false, chargeableWeightUsed: q.chargeableWeightUsed, basis: "formula" };
    }

    return { ...base, fee: flatSectorFee(config, sector), needsReview: false, chargeableWeightUsed: null, basis: "flat" };
}
