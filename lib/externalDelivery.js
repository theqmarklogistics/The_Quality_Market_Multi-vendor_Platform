import prisma from "@/lib/prisma";
import { chargeableWeightKg, roundUpToHalfKg } from "@/lib/deliveryPricing";
import { KIGALI_HUB } from "@/lib/deliveryEta";
import { routeDistanceKm } from "@/lib/distanceProvider";
import { getDeliveryZone, lookupWeightZoneRate } from "@/lib/pricing";
import { STRATEGIES, quoteByStrategy, paramsForStrategy } from "@/lib/shipping/strategies";

const DEFAULT_BASE_PRICE = 2000; // RWF, used as the flat fallback fee

// Load the singleton external-delivery pricing config, creating it on first use.
// New rate columns (baseRatePerKgKm, minimumFloor, volumetricFactor, distanceTiers)
// carry DB defaults, so the minimal create() below still produces a valid row.
export async function getExternalDeliveryConfig() {
    let config = await prisma.externalDeliveryConfig.findUnique({ where: { id: "default" } });
    if (!config) {
        config = await prisma.externalDeliveryConfig.create({
            data: { id: "default", basePrice: DEFAULT_BASE_PRICE, perSector: {} },
        });
    }
    return config;
}

// Legacy flat/per-sector price — the fallback when distance or weight is unknown.
export function flatSectorFee(config, sector) {
    const perSector = config.perSector && typeof config.perSector === "object" ? config.perSector : {};
    const override = sector ? perSector[sector] : null;
    const price = Number.isFinite(override) && override > 0 ? override : config.basePrice;
    return parseFloat(Number(price ?? DEFAULT_BASE_PRICE).toFixed(2));
}

const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));

// ── Corridor lane pricing ────────────────────────────────────────────────────
// An active CorridorRoute with a fixed or per-km rate overrides the formula/
// strategy fee for drops whose sector appears in the corridor's `areas`.
// Corridors change rarely (admin only) → 5-minute in-process cache, invalidated
// from the admin corridor mutation routes.
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

// ── Strategy dispatch ────────────────────────────────────────────────────────
// Quote with the admin-selected strategy (LEGACY formula by default). Returns
// null when the strategy can't produce a fee (e.g. missing distance) so the
// caller falls back to the flat/per-sector price.
async function strategyFee({ config, chargeableKg, distanceKm, sector }) {
    if (!(chargeableKg > 0)) return null;
    const strategy = STRATEGIES.includes(config?.activeStrategy) ? config.activeStrategy : "LEGACY";

    // Model A prices by (zone × weight bracket) and doesn't need a distance.
    let zoneRate = null;
    if (strategy === "ZONE_WEIGHT" && sector) {
        const billed = roundUpToHalfKg(chargeableKg);
        zoneRate = await lookupWeightZoneRate(prisma, getDeliveryZone(sector), billed);
        if (zoneRate > 0) {
            const q = quoteByStrategy({
                strategy, chargeableKg, distanceKm: distanceKm ?? 0, zoneRate,
                params: paramsForStrategy(config?.strategyParams, strategy),
                legacyConfig: config,
            });
            if (q.strategy === "ZONE_WEIGHT") return { fee: q.fee, basis: "zone_weight" };
        }
        // No bracket for this zone/weight → distance-based legacy fallback below.
    }

    if (distanceKm != null && distanceKm > 0) {
        const q = quoteByStrategy({
            strategy, chargeableKg, distanceKm, zoneRate,
            params: paramsForStrategy(config?.strategyParams, strategy),
            legacyConfig: config,
        });
        return { fee: q.fee, basis: q.strategy === "LEGACY" ? "formula" : q.strategy.toLowerCase() };
    }
    return null;
}

/**
 * Published delivery fee charged to the partner at booking (priced as a batch of
 * one). Uses the distance + weight formula when both are known, otherwise falls
 * back to the flat/per-sector price.
 *
 *   max(floor, round(baseRate × chargeableKg × distanceKm × tierMultiplier(distanceKm)))
 *
 * @param {object|string} opts  { sector, distanceKm?, dropLat?, dropLng?,
 *                                originLat?, originLng?,
 *                                weightKg?, lengthCm?, widthCm?, heightCm? }
 *                                — or a bare sector string (legacy callers).
 *                                originLat/originLng override the hub as the
 *                                distance origin (pickup point or the rider's
 *                                recorded location for walk-up bookings).
 * @returns {Promise<{fee:number, chargeableKg:number, distanceKm:number|null, basis:"formula"|"flat"}>}
 */
export async function quoteExternalDeliveryFee(opts = {}) {
    const o = typeof opts === "string" ? { sector: opts } : (opts || {});
    const config = await getExternalDeliveryConfig();

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

    const chargeableKg = chargeableWeightKg(
        o.weightKg, o.lengthCm, o.widthCm, o.heightCm, config.volumetricFactor
    );

    const base = {
        chargeableKg: round2(chargeableKg),
        billedKg: roundUpToHalfKg(chargeableKg),
        distanceKm: distanceKm != null ? round2(distanceKm) : null,
    };

    // 1) Corridor lane rate wins when one covers the drop's sector.
    const corridorFee = await corridorFeeOverride(o.sector, distanceKm, config);
    if (corridorFee != null) return { ...base, fee: corridorFee, basis: "corridor" };

    // 2) Active strategy (LEGACY formula by default; needs weight + distance,
    //    except ZONE_WEIGHT which prices by zone bracket alone).
    const strat = await strategyFee({ config, chargeableKg, distanceKm, sector: o.sector });
    if (strat) return { ...base, fee: strat.fee, basis: strat.basis };

    // 3) Flat/per-sector fallback.
    return { ...base, fee: flatSectorFee(config, o.sector), basis: "flat" };
}

/**
 * Pooled-delivery fee for a cart of items (batch of one — the checkout charge).
 * Items without weight/dimension data still occupy the rider, so they bill at
 * 1 kg per unit. Falls back to the flat/per-sector price when no drop point is
 * known. Used by checkout (order creation + live quote) and the pool-quote API.
 *
 * @param {{items?:Array<{weightKg?:number,lengthCm?:number,widthCm?:number,heightCm?:number,quantity?:number}>,
 *          lat?:number|null, lng?:number|null, sector?:string|null,
 *          originLat?:number|null, originLng?:number|null}} opts
 * @returns {Promise<{fee:number, chargeableKg:number, distanceKm:number|null, basis:"formula"|"flat"}>}
 */
export async function quotePooledCartFee({ items = [], lat = null, lng = null, sector = null, originLat = null, originLng = null } = {}) {
    const config = await getExternalDeliveryConfig();

    let chargeableKg = 0;
    for (const item of items) {
        const qty = Math.max(1, parseInt(item?.quantity, 10) || 1);
        const perUnit = chargeableWeightKg(item?.weightKg, item?.lengthCm, item?.widthCm, item?.heightCm, config.volumetricFactor);
        chargeableKg += (perUnit > 0 ? perUnit : 1) * qty;
    }

    const origin = (Number.isFinite(originLat) && Number.isFinite(originLng))
        ? { lat: originLat, lng: originLng }
        : KIGALI_HUB;

    let distanceKm = null;
    if (lat != null && lng != null) {
        distanceKm = await routeDistanceKm(origin, { lat, lng });
    }

    const base = {
        chargeableKg: round2(chargeableKg),
        billedKg: roundUpToHalfKg(chargeableKg),
        distanceKm: distanceKm != null ? round2(distanceKm) : null,
    };

    // Same precedence as quoteExternalDeliveryFee: corridor rate → strategy → flat.
    const corridorFee = await corridorFeeOverride(sector, distanceKm, config);
    if (corridorFee != null) return { ...base, fee: corridorFee, basis: "corridor" };

    const strat = await strategyFee({ config, chargeableKg, distanceKm, sector });
    if (strat) return { ...base, fee: strat.fee, basis: strat.basis };

    return { ...base, fee: flatSectorFee(config, sector), basis: "flat" };
}
