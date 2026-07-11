import prisma from "@/lib/prisma";
import { quoteStandaloneFee, chargeableWeightKg } from "@/lib/deliveryPricing";
import { haversineKm, KIGALI_HUB, isOsrmPricingEnabled, roadDistanceKm } from "@/lib/deliveryEta";

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

    // Distance: explicit km wins; else derive from a drop pin (road distance via
    // OSRM when enabled, otherwise straight-line haversine).
    let distanceKm = Number.isFinite(o.distanceKm) ? o.distanceKm : null;
    if (distanceKm == null && o.dropLat != null && o.dropLng != null) {
        const drop = { lat: o.dropLat, lng: o.dropLng };
        if (isOsrmPricingEnabled()) distanceKm = await roadDistanceKm(origin, drop);
        if (distanceKm == null) distanceKm = haversineKm(origin, drop);
    }

    const chargeableKg = chargeableWeightKg(
        o.weightKg, o.lengthCm, o.widthCm, o.heightCm, config.volumetricFactor
    );

    // The formula needs a positive distance AND weight; otherwise fall back.
    if (distanceKm != null && distanceKm > 0 && chargeableKg > 0) {
        return {
            fee: quoteStandaloneFee({ chargeableKg, distanceKm, config }),
            chargeableKg: round2(chargeableKg),
            distanceKm: round2(distanceKm),
            basis: "formula",
        };
    }

    return {
        fee: flatSectorFee(config, o.sector),
        chargeableKg: round2(chargeableKg),
        distanceKm: distanceKm != null ? round2(distanceKm) : null,
        basis: "flat",
    };
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
        const drop = { lat, lng };
        if (isOsrmPricingEnabled()) distanceKm = await roadDistanceKm(origin, drop);
        if (distanceKm == null) distanceKm = haversineKm(origin, drop);
    }

    if (distanceKm != null && distanceKm > 0 && chargeableKg > 0) {
        return {
            fee: quoteStandaloneFee({ chargeableKg, distanceKm, config }),
            chargeableKg: round2(chargeableKg),
            distanceKm: round2(distanceKm),
            basis: "formula",
        };
    }

    return {
        fee: flatSectorFee(config, sector),
        chargeableKg: round2(chargeableKg),
        distanceKm: distanceKm != null ? round2(distanceKm) : null,
        basis: "flat",
    };
}
