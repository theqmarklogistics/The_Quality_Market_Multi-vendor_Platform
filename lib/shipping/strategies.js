// Pluggable shipping-fee strategies for pooled/external delivery quotes.
//
// All strategies price the BILLED weight (chargeable weight rounded up to the
// nearest 0.5 kg) against the road-network distance from lib/distanceProvider.
// The active strategy + its parameters live on ExternalDeliveryConfig
// (`activeStrategy`, `strategyParams`) and are admin-editable; LEGACY (the
// original kg×km×tier formula) is the default so live pricing never changes
// until an admin explicitly switches.
//
// Pure functions — unit-tested in scripts/check-shipping-strategies.mjs.
import { quoteStandaloneFee, roundUpToHalfKg } from "../deliveryPricing.js";

export const STRATEGIES = ["LEGACY", "ZONE_WEIGHT", "DISTANCE_WEIGHT", "HYBRID_MARGIN"];

export const STRATEGY_DEFAULTS = {
    // Model B — fee = baseFee + km×perKmRate + kg×perKgRate, floored at minFee.
    DISTANCE_WEIGHT: {
        baseFee: 1000,   // RWF
        perKmRate: 150,  // RWF per road-km
        perKgRate: 100,  // RWF per billed kg
        minFee: 2000,    // RWF floor
    },
    // Model C — fee = max(costEstimate × (1+margin), minFee), rounded up to a
    // clean number; costEstimate = fuelPerKm×km + handling + kg×variableRate.
    HYBRID_MARGIN: {
        fuelPerKm: 150,     // RWF per road-km (fuel + wear)
        handlingFee: 500,   // RWF per package (sorting/labelling)
        perKgVariable: 80,  // RWF per billed kg
        targetMargin: 0.25, // 25% on top of estimated cost
        minFee: 2000,       // RWF floor — never deliver below this
        roundTo: 100,       // round the final fee UP to this step
    },
};

const num = (v, fallback) => (Number.isFinite(v) && v >= 0 ? v : fallback);

/**
 * Model A — Zone + weight tiers. The (zone × weight bracket) price comes from
 * the existing WeightShippingRate table; the caller looks it up (DB) and passes
 * it in so this stays pure. Returns null when no bracket rate exists — the
 * dispatcher then falls back to the LEGACY formula rather than quoting 0.
 */
export function quoteZoneWeight({ zoneRate, minFee = 0 }) {
    if (!Number.isFinite(zoneRate) || zoneRate <= 0) return null;
    return Math.max(Math.round(num(minFee, 0)), Math.round(zoneRate));
}

/** Model B — distance-based + weight surcharge, with a min-fee floor. */
export function quoteDistanceWeight({ billedKg, distanceKm, params = {} }) {
    const p = { ...STRATEGY_DEFAULTS.DISTANCE_WEIGHT, ...params };
    const kg = Math.max(0, Number(billedKg) || 0);
    const km = Math.max(0, Number(distanceKm) || 0);
    const fee = num(p.baseFee, 0) + km * num(p.perKmRate, 0) + kg * num(p.perKgRate, 0);
    return Math.max(Math.round(num(p.minFee, 0)), Math.round(fee));
}

/** Model C — hybrid with margin floor, rounded up to a clean number. */
export function quoteHybridMargin({ billedKg, distanceKm, params = {} }) {
    const p = { ...STRATEGY_DEFAULTS.HYBRID_MARGIN, ...params };
    const kg = Math.max(0, Number(billedKg) || 0);
    const km = Math.max(0, Number(distanceKm) || 0);
    const costEstimate = num(p.fuelPerKm, 0) * km + num(p.handlingFee, 0) + kg * num(p.perKgVariable, 0);
    const margin = Number.isFinite(p.targetMargin) && p.targetMargin >= 0 ? p.targetMargin : 0;
    const fee = Math.max(costEstimate * (1 + margin), num(p.minFee, 0));
    const step = num(p.roundTo, 100) || 100;
    return Math.ceil(fee / step) * step;
}

/**
 * Strategy dispatcher. Rounds the chargeable weight up to 0.5 kg, then quotes
 * with the active model. `zoneRate` (Model A) is the pre-looked-up
 * WeightShippingRate cost for (zone × billedKg); when it's missing the
 * dispatcher falls back to the LEGACY formula so a gap in the tariff table can
 * never produce a free delivery.
 *
 * @returns {{fee:number, strategy:string, billedKg:number}}
 */
export function quoteByStrategy({ strategy, chargeableKg, distanceKm, zoneRate = null, params = {}, legacyConfig = {} }) {
    const billedKg = roundUpToHalfKg(Math.max(0, Number(chargeableKg) || 0));
    const active = STRATEGIES.includes(strategy) ? strategy : "LEGACY";

    if (active === "ZONE_WEIGHT") {
        const fee = quoteZoneWeight({ zoneRate, minFee: params?.minFee });
        if (fee != null) return { fee, strategy: "ZONE_WEIGHT", billedKg };
        // No bracket configured → legacy formula fallback.
    } else if (active === "DISTANCE_WEIGHT") {
        return { fee: quoteDistanceWeight({ billedKg, distanceKm, params }), strategy: "DISTANCE_WEIGHT", billedKg };
    } else if (active === "HYBRID_MARGIN") {
        return { fee: quoteHybridMargin({ billedKg, distanceKm, params }), strategy: "HYBRID_MARGIN", billedKg };
    }

    return {
        fee: quoteStandaloneFee({ chargeableKg, distanceKm, config: legacyConfig }),
        strategy: "LEGACY",
        billedKg,
    };
}

/** Per-strategy params extracted from ExternalDeliveryConfig.strategyParams. */
export function paramsForStrategy(strategyParams, strategy) {
    const all = strategyParams && typeof strategyParams === "object" ? strategyParams : {};
    const p = all[strategy];
    return p && typeof p === "object" ? p : {};
}
