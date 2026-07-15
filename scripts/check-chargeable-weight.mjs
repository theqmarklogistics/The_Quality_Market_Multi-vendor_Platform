import assert from 'node:assert/strict';
import {
  volumetricWeightKg,
  chargeableWeightKg,
  roundUpToHalfKg,
  billedWeightKg,
  quoteStandaloneFee,
  computeRouteShares,
} from '../lib/deliveryPricing.js';

function run() {
  // ── Work-order worked example ──────────────────────────────────────────────
  // 2 kg actual, 40×20×20 cm, divisor 5000 (volumetricFactor 200 kg/m³):
  //   volumetric = 16000 / 5000 = 3.2 kg
  //   chargeable = max(2, 3.2)  = 3.2 kg
  //   billed     = 3.2 rounded UP to nearest 0.5 = 3.5 kg
  assert.equal(volumetricWeightKg(40, 20, 20, 200), 3.2);
  assert.equal(chargeableWeightKg(2, 40, 20, 20, 200), 3.2);
  assert.equal(billedWeightKg(2, 40, 20, 20, 200), 3.5);

  // Divisor is configurable: factor 100 kg/m³ ⇒ divisor 10000 ⇒ 1.6 kg volumetric,
  // actual 2 kg wins.
  assert.equal(volumetricWeightKg(40, 20, 20, 100), 1.6);
  assert.equal(chargeableWeightKg(2, 40, 20, 20, 100), 2);

  // ── Round-up-to-0.5 behaviour ──────────────────────────────────────────────
  assert.equal(roundUpToHalfKg(3.2), 3.5);
  assert.equal(roundUpToHalfKg(3.5), 3.5); // exact halves stay put
  assert.equal(roundUpToHalfKg(3.51), 4);
  assert.equal(roundUpToHalfKg(0.1), 0.5);
  assert.equal(roundUpToHalfKg(0), 0);
  assert.equal(roundUpToHalfKg(-2), 0);

  // ── Fees bill the rounded weight ───────────────────────────────────────────
  // 100.2 kg chargeable → billed 100.5: 8 × 100.5 × 10 km × 0.85 = 6834
  assert.equal(quoteStandaloneFee({ chargeableKg: 100.2, distanceKm: 10, config: {} }), 6834);
  // Whole-half weights are unchanged: 8 × 50 × 15 × 0.7 = 4200
  assert.equal(quoteStandaloneFee({ chargeableKg: 50, distanceKm: 15, config: {} }), 4200);

  // ── Single-stop corridor still prices exactly like a solo booking ──────────
  const stop = { chargeableKg: 3.2, lat: -1.85, lng: 30.0619 };
  const route = computeRouteShares([stop], {});
  const solo = quoteStandaloneFee({
    chargeableKg: 3.2,
    distanceKm: route.routeDistanceKm,
    config: {},
  });
  assert.equal(route.routePrice, solo);

  console.log('check-chargeable-weight: all assertions passed ✔');
}

run();
