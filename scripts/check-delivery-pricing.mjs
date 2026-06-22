import assert from 'node:assert/strict';
import {
  chargeableWeightKg,
  volumetricWeightKg,
  tierMultiplier,
  quoteStandaloneFee,
  computeRouteShares,
  splitByRatio,
} from '../lib/deliveryPricing.js';
import { haversineKm, KIGALI_HUB } from '../lib/deliveryEta.js';

function run() {
  // ── Volumetric: 1 m³ (100×100×100 cm) at factor 200 ⇒ 200 kg ──────────────
  assert.equal(volumetricWeightKg(100, 100, 100, 200), 200);
  // Chargeable weight = max(actual, volumetric).
  assert.equal(chargeableWeightKg(50, 100, 100, 100, 200), 200); // volume wins
  assert.equal(chargeableWeightKg(300, 100, 100, 100, 200), 300); // actual wins
  assert.equal(chargeableWeightKg(10, 0, 0, 0, 200), 10); // no dims → actual

  // ── Tier multiplier at boundaries (default tiers) ─────────────────────────
  assert.equal(tierMultiplier(3), 1.0);
  assert.equal(tierMultiplier(5), 1.0);
  assert.equal(tierMultiplier(7), 0.85);
  assert.equal(tierMultiplier(10), 0.85);
  assert.equal(tierMultiplier(15), 0.7);
  assert.equal(tierMultiplier(25), 0.6); // open tier
  assert.equal(tierMultiplier(8, []), 0.85); // empty → DEFAULT_TIERS fallback

  // ── Standalone fee = max(floor, round(rate × kg × dist × multiplier)) ─────
  assert.equal(quoteStandaloneFee({ chargeableKg: 10, distanceKm: 3, config: {} }), 2000); // 240 → floor
  assert.equal(quoteStandaloneFee({ chargeableKg: 50, distanceKm: 15, config: {} }), 4200); // 8·50·15·0.7
  assert.equal(quoteStandaloneFee({ chargeableKg: 200, distanceKm: 8, config: {} }), 10880); // 8·200·8·0.85

  // ── splitByRatio reconciles to the exact total ────────────────────────────
  assert.equal(splitByRatio(100, [1, 1, 1]).reduce((s, x) => s + x, 0), 100);
  assert.equal(splitByRatio(2000, [0, 0, 0]).reduce((s, x) => s + x, 0), 2000); // even fallback
  const sr = splitByRatio(1000, [3, 1]);
  assert.equal(sr.reduce((s, x) => s + x, 0), 1000);
  assert.ok(sr[0] > sr[1]); // heavier weight gets the larger share

  // ── Single-stop route price equals the standalone quote ───────────────────
  const stop = { chargeableKg: 50, lat: -1.85, lng: 30.0619 };
  const dist = haversineKm(KIGALI_HUB, { lat: stop.lat, lng: stop.lng });
  const solo = quoteStandaloneFee({ chargeableKg: 50, distanceKm: dist, config: {} });
  const oneRoute = computeRouteShares([stop], {});
  assert.equal(oneRoute.routePrice, solo);
  assert.equal(oneRoute.shares[0], solo);

  // ── Multi-stop: shares sum exactly to the route price ─────────────────────
  const stops = [
    { chargeableKg: 20, lat: -1.95, lng: 30.07 },
    { chargeableKg: 60, lat: -1.90, lng: 30.10 },
    { chargeableKg: 10, lat: -1.98, lng: 30.05 },
  ];
  const route = computeRouteShares(stops, {});
  assert.equal(route.shares.length, stops.length);
  assert.equal(route.shares.reduce((s, x) => s + x, 0), route.routePrice);
  assert.ok(route.routePrice >= 2000); // never below the floor

  // ── Precomputed (e.g. OSRM) distances override haversine, deterministically ─
  const osrm = computeRouteShares(
    [{ chargeableKg: 50 }, { chargeableKg: 50 }],
    {},
    undefined,
    { dropDistances: [5, 15], routeKm: 25 }
  );
  // loads = [250, 750]; tier(25) = 0.6 (open); price = round(8 × 1000 × 0.6) = 4800.
  assert.equal(osrm.routeDistanceKm, 25);
  assert.equal(osrm.routePrice, 4800);
  assert.deepEqual(osrm.shares, [1200, 3600]);
  assert.equal(osrm.shares.reduce((s, x) => s + x, 0), osrm.routePrice);

  console.log('delivery pricing checks passed');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
