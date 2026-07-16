import assert from 'node:assert/strict';
import {
  chargeableWeightKg,
  volumetricWeightKg,
  taperFactor,
  lookupWeightRange,
  computeShippingFee,
  computeRouteShares,
  splitByRatio,
} from '../lib/deliveryPricing.js';
import { haversineKm, KIGALI_HUB } from '../lib/deliveryEta.js';

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// Admin weight ranges: greater weight → chargeable value. Open top tier at 10+.
const RANGES = [
  { minWeightKg: 0, maxWeightKg: 1, chargeableKg: 1 },
  { minWeightKg: 1, maxWeightKg: 3, chargeableKg: 3 },
  { minWeightKg: 3, maxWeightKg: 5, chargeableKg: 5 },
  { minWeightKg: 5, maxWeightKg: 10, chargeableKg: 10 },
  { minWeightKg: 10, maxWeightKg: null, chargeableKg: 15 },
];
// Same ranges but WITHOUT an open tier — heavy weights fall out of range.
const CAPPED = RANGES.slice(0, 4);

function run() {
  // ── Volumetric: 1 m³ (100×100×100 cm) at factor 200 ⇒ 200 kg ──────────────
  assert.equal(volumetricWeightKg(100, 100, 100, 200), 200);
  assert.equal(chargeableWeightKg(50, 100, 100, 100, 200), 200); // volume wins
  assert.equal(chargeableWeightKg(300, 100, 100, 100, 200), 300); // actual wins
  assert.equal(chargeableWeightKg(10, 0, 0, 0, 200), 10); // no dims → actual

  // ── Distance taper: Σ per 5-km segment × (100%, 90%, 80% … 50% floor) ──────
  approx(taperFactor(0, {}), 0);
  approx(taperFactor(3, {}), 3.0);        // 3 × 1.0
  approx(taperFactor(5, {}), 5.0);        // 5 × 1.0
  approx(taperFactor(7, {}), 6.8);        // 5×1.0 + 2×0.9
  approx(taperFactor(12, {}), 11.1);      // 5×1.0 + 5×0.9 + 2×0.8
  approx(taperFactor(25, {}), 20.0);      // 5×(1.0+0.9+0.8+0.7+0.6)
  approx(taperFactor(30, {}), 22.5);      // + 5×0.5 (floor)
  approx(taperFactor(35, {}), 25.0);      // + another 5×0.5 (stays at floor)

  // Custom taper params flow through.
  approx(taperFactor(20, { taperStepKm: 10, taperDropPerStep: 0.2, taperFloorPct: 0.6 }), 18.0); // 10×1.0 + 10×0.8

  // ── Weight-range lookup: greater weight → chargeable value ─────────────────
  assert.equal(lookupWeightRange(0.5, RANGES), 1);
  assert.equal(lookupWeightRange(2, RANGES), 3);
  assert.equal(lookupWeightRange(7.2, RANGES), 10);
  assert.equal(lookupWeightRange(200, RANGES), 15);  // open tier
  assert.equal(lookupWeightRange(0, RANGES), null);  // zero/invalid
  assert.equal(lookupWeightRange(12, CAPPED), null); // above the top, no open tier
  assert.equal(lookupWeightRange(2, []), null);      // no ranges configured

  // ── Fee = max(floor, round(baseRate × chargeableWeight × effectiveDist)) ───
  const cfg = { baseRatePerKgKm: 100 }; // Rwf per km · chargeable-kg
  // Worked example: 2 kg actual, 30×30×40 cm ⇒ vol 7.2 kg ⇒ range 10; 12 km.
  const wx = computeShippingFee({ actualKg: 2, lengthCm: 30, widthCm: 30, heightCm: 40, distanceKm: 12, ranges: RANGES, config: cfg });
  assert.equal(wx.volumetricKg, 7.2);
  assert.equal(wx.greaterWeightKg, 7.2);
  assert.equal(wx.chargeableWeightUsed, 10);
  assert.equal(wx.needsReview, false);
  assert.equal(wx.fee, 11100); // 100 × 10 × 11.1
  // Short/light trip hits the floor: 100 × 1 × 3 = 300 → 2000.
  assert.equal(computeShippingFee({ greaterWeightKg: 0.5, distanceKm: 3, ranges: RANGES, config: cfg }).fee, 2000);
  // Out-of-range weight ⇒ needsReview, no fee.
  const nr = computeShippingFee({ greaterWeightKg: 12, distanceKm: 8, ranges: CAPPED, config: cfg });
  assert.equal(nr.needsReview, true);
  assert.equal(nr.fee, null);

  // ── EXPRESS: same formula, its own base rate ───────────────────────────────
  const xCfg = { baseRatePerKgKm: 100, expressBaseRatePerKgKm: 200 };
  const normal = computeShippingFee({ greaterWeightKg: 8, distanceKm: 12, ranges: RANGES, config: xCfg });
  const xpress = computeShippingFee({ greaterWeightKg: 8, distanceKm: 12, ranges: RANGES, config: xCfg, express: true });
  assert.equal(normal.fee, 11100);  // 100 × 10 × 11.1
  assert.equal(xpress.fee, 22200);  // 200 × 10 × 11.1
  // Express default rate falls back when unset (16 = 2× the default 8).
  assert.equal(
    computeShippingFee({ greaterWeightKg: 8, distanceKm: 12, ranges: RANGES, config: {}, express: true }).fee,
    Math.max(2000, Math.round(16 * 10 * 11.1))
  );

  // ── splitByRatio reconciles to the exact total ────────────────────────────
  assert.equal(splitByRatio(100, [1, 1, 1]).reduce((s, x) => s + x, 0), 100);
  assert.equal(splitByRatio(2000, [0, 0, 0]).reduce((s, x) => s + x, 0), 2000); // even fallback
  const sr = splitByRatio(1000, [3, 1]);
  assert.equal(sr.reduce((s, x) => s + x, 0), 1000);
  assert.ok(sr[0] > sr[1]);

  // ── Single-stop route price equals the standalone quote ───────────────────
  const stop = { chargeableKg: 8, lat: -1.85, lng: 30.0619 }; // chargeableKg carries the greater weight
  const dist = haversineKm(KIGALI_HUB, { lat: stop.lat, lng: stop.lng });
  const solo = computeShippingFee({ greaterWeightKg: 8, distanceKm: dist, ranges: RANGES, config: cfg }).fee;
  const oneRoute = computeRouteShares([stop], cfg, RANGES);
  assert.equal(oneRoute.routePrice, solo);
  assert.equal(oneRoute.shares[0], solo);

  // ── Multi-stop: shares sum exactly to the route price ─────────────────────
  const stops = [
    { chargeableKg: 2, lat: -1.95, lng: 30.07 },
    { chargeableKg: 8, lat: -1.90, lng: 30.10 },
    { chargeableKg: 4, lat: -1.98, lng: 30.05 },
  ];
  const route = computeRouteShares(stops, cfg, RANGES);
  assert.equal(route.shares.length, stops.length);
  assert.equal(route.shares.reduce((s, x) => s + x, 0), route.routePrice);
  assert.ok(route.routePrice >= 2000); // never below the floor

  // ── Precomputed distances (e.g. OSRM) override haversine, deterministically ─
  const osrm = computeRouteShares(
    [{ chargeableKg: 8 }, { chargeableKg: 8 }],
    cfg,
    RANGES,
    undefined,
    { dropDistances: [5, 15], routeKm: 20 }
  );
  // chargeable 10 each; fee0 = 100×10×taper(5)=5000; fee1 = 100×10×taper(15)=13500.
  assert.equal(osrm.routeDistanceKm, 20);
  assert.equal(osrm.routePrice, 18500);
  assert.deepEqual(osrm.shares, [5000, 13500]);
  assert.equal(osrm.shares.reduce((s, x) => s + x, 0), osrm.routePrice);

  console.log('delivery pricing checks passed');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
