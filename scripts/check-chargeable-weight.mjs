import assert from 'node:assert/strict';
import {
  volumetricWeightKg,
  chargeableWeightKg,
  roundUpToHalfKg,
  lookupWeightRange,
  computeShippingFee,
  computeRouteShares,
} from '../lib/deliveryPricing.js';

const RANGES = [
  { minWeightKg: 0, maxWeightKg: 1, chargeableKg: 1 },
  { minWeightKg: 1, maxWeightKg: 5, chargeableKg: 5 },
  { minWeightKg: 5, maxWeightKg: null, chargeableKg: 10 },
];

function run() {
  // ── Volumetric + greater-weight worked example ─────────────────────────────
  // 2 kg actual, 40×20×20 cm, divisor 5000 (volumetricFactor 200 kg/m³):
  //   volumetric = 16000 / 5000 = 3.2 kg ; greater = max(2, 3.2) = 3.2 kg
  assert.equal(volumetricWeightKg(40, 20, 20, 200), 3.2);
  assert.equal(chargeableWeightKg(2, 40, 20, 20, 200), 3.2);

  // Divisor is configurable: factor 100 kg/m³ ⇒ divisor 10000 ⇒ 1.6 kg volumetric,
  // actual 2 kg wins.
  assert.equal(volumetricWeightKg(40, 20, 20, 100), 1.6);
  assert.equal(chargeableWeightKg(2, 40, 20, 20, 100), 2);

  // ── Round-up-to-0.5 util (display only) ────────────────────────────────────
  assert.equal(roundUpToHalfKg(3.2), 3.5);
  assert.equal(roundUpToHalfKg(3.5), 3.5);
  assert.equal(roundUpToHalfKg(3.51), 4);
  assert.equal(roundUpToHalfKg(0), 0);
  assert.equal(roundUpToHalfKg(-2), 0);

  // ── The greater weight is what's matched to a range ────────────────────────
  // 3.2 kg greater ⇒ range 1–5 ⇒ chargeable 5.
  assert.equal(lookupWeightRange(3.2, RANGES), 5);
  const q = computeShippingFee({ actualKg: 2, lengthCm: 40, widthCm: 20, heightCm: 20, distanceKm: 5, ranges: RANGES, config: { baseRatePerKgKm: 100 } });
  assert.equal(q.greaterWeightKg, 3.2);
  assert.equal(q.chargeableWeightUsed, 5);
  assert.equal(q.fee, 2500); // 100 × 5 × taper(5)=5.0

  // ── Single-stop corridor still prices exactly like a solo booking ──────────
  const cfg = { baseRatePerKgKm: 100 };
  const stop = { chargeableKg: 3.2, lat: -1.85, lng: 30.0619 };
  const route = computeRouteShares([stop], cfg, RANGES);
  const solo = computeShippingFee({ greaterWeightKg: 3.2, distanceKm: route.routeDistanceKm, ranges: RANGES, config: cfg }).fee;
  assert.equal(route.routePrice, solo);

  console.log('check-chargeable-weight: all assertions passed ✔');
}

run();
