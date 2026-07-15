import assert from 'node:assert/strict';
import {
  quoteZoneWeight,
  quoteDistanceWeight,
  quoteHybridMargin,
  quoteByStrategy,
  paramsForStrategy,
  STRATEGY_DEFAULTS,
} from '../lib/shipping/strategies.js';
import { chargeableWeightKg, roundUpToHalfKg } from '../lib/deliveryPricing.js';

function run() {
  // The task-4 example package: 2 kg actual, 40×20×20 cm ⇒ chargeable 3.2 kg,
  // billed 3.5 kg. Quoted over a 10 km road route.
  const pkg = { chargeableKg: chargeableWeightKg(2, 40, 20, 20, 200), distanceKm: 10 };
  assert.equal(pkg.chargeableKg, 3.2);
  assert.equal(roundUpToHalfKg(pkg.chargeableKg), 3.5);

  // ── Model A — Zone + weight tiers ──────────────────────────────────────────
  // Bracket price comes straight from the tariff table (e.g. Zone B, 3–5 kg = 3000).
  assert.equal(quoteZoneWeight({ zoneRate: 3000 }), 3000);
  assert.equal(quoteZoneWeight({ zoneRate: 1500, minFee: 2000 }), 2000); // floor wins
  assert.equal(quoteZoneWeight({ zoneRate: 0 }), null); // no bracket → dispatcher falls back
  assert.equal(quoteZoneWeight({ zoneRate: null }), null);

  const viaA = quoteByStrategy({ strategy: 'ZONE_WEIGHT', ...pkg, zoneRate: 3000 });
  assert.equal(viaA.fee, 3000);
  assert.equal(viaA.strategy, 'ZONE_WEIGHT');
  assert.equal(viaA.billedKg, 3.5);
  // Missing bracket → legacy formula fallback, never a free delivery.
  const viaAFallback = quoteByStrategy({ strategy: 'ZONE_WEIGHT', ...pkg, zoneRate: null, legacyConfig: {} });
  assert.equal(viaAFallback.strategy, 'LEGACY');
  assert.ok(viaAFallback.fee >= 2000);

  // ── Model B — Distance + weight surcharge ──────────────────────────────────
  // Defaults: 1000 + 10×150 + 3.5×100 = 2850.
  assert.equal(quoteDistanceWeight({ billedKg: 3.5, distanceKm: 10 }), 2850);
  // min_fee floor is enforced (short/light trip).
  assert.equal(quoteDistanceWeight({ billedKg: 0.5, distanceKm: 1, params: { minFee: 2000 } }), 2000);
  // Param overrides are respected: 500 + 10×200 + 3.5×300 = 3550.
  assert.equal(
    quoteDistanceWeight({ billedKg: 3.5, distanceKm: 10, params: { baseFee: 500, perKmRate: 200, perKgRate: 300 } }),
    3550
  );
  const viaB = quoteByStrategy({ strategy: 'DISTANCE_WEIGHT', ...pkg });
  assert.equal(viaB.fee, 2850);
  assert.equal(viaB.strategy, 'DISTANCE_WEIGHT');

  // ── Model C — Hybrid with margin floor ─────────────────────────────────────
  // Defaults: cost = 150×10 + 500 + 3.5×80 = 2280; ×1.25 = 2850; round up to 100 → 2900.
  assert.equal(quoteHybridMargin({ billedKg: 3.5, distanceKm: 10 }), 2900);
  // Margin floor: tiny trip → minFee wins (rounded to the clean step).
  assert.equal(quoteHybridMargin({ billedKg: 0.5, distanceKm: 1, params: { minFee: 2000 } }), 2000);
  // Fee never drops below cost × (1+margin): 40% margin on the same package.
  const c40 = quoteHybridMargin({ billedKg: 3.5, distanceKm: 10, params: { targetMargin: 0.4 } });
  assert.ok(c40 >= 2280 * 1.4);
  assert.equal(c40 % 100, 0); // clean number
  const viaC = quoteByStrategy({ strategy: 'HYBRID_MARGIN', ...pkg });
  assert.equal(viaC.fee, 2900);
  assert.equal(viaC.strategy, 'HYBRID_MARGIN');

  // ── LEGACY stays the default and unknown strategies fall back to it ────────
  const legacy = quoteByStrategy({ strategy: 'LEGACY', ...pkg, legacyConfig: {} });
  assert.equal(legacy.strategy, 'LEGACY');
  assert.equal(legacy.fee, 2000); // 8 × 3.5 × 10 × 0.85 = 238 → floor 2000
  assert.equal(quoteByStrategy({ strategy: 'NOT_A_MODEL', ...pkg, legacyConfig: {} }).strategy, 'LEGACY');

  // ── Config-driven params helper ────────────────────────────────────────────
  const params = { DISTANCE_WEIGHT: { perKmRate: 999 } };
  assert.equal(paramsForStrategy(params, 'DISTANCE_WEIGHT').perKmRate, 999);
  assert.deepEqual(paramsForStrategy(params, 'HYBRID_MARGIN'), {});
  assert.deepEqual(paramsForStrategy(null, 'DISTANCE_WEIGHT'), {});
  // Defaults exist for every parameterised model.
  assert.ok(STRATEGY_DEFAULTS.DISTANCE_WEIGHT.minFee > 0);
  assert.ok(STRATEGY_DEFAULTS.HYBRID_MARGIN.minFee > 0);

  console.log('check-shipping-strategies: all assertions passed ✔');
}

run();
