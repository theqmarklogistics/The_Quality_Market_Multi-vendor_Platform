import assert from 'node:assert/strict';
import { orderStopsByDistance } from '../lib/batchOrdering.js';

function run() {
  // ── Nearest first: ascending hub→drop distance ─────────────────────────────
  const stops = [
    { id: 'far', lat: -1.99, lng: 30.15 },
    { id: 'near', lat: -1.945, lng: 30.06 },
    { id: 'mid', lat: -1.96, lng: 30.10 },
  ];
  const ordered = orderStopsByDistance(stops, [12.4, 1.1, 6.7]);
  assert.deepEqual(ordered.map((s) => s.id), ['near', 'mid', 'far']);
  // Each stop carries its persisted distance (rounded to 2 dp).
  assert.deepEqual(ordered.map((s) => s.deliveryDistanceKm), [1.1, 6.7, 12.4]);

  // ── Unknown distances sort last and keep their relative order ──────────────
  const mixed = orderStopsByDistance(
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    [8, null, 2, null]
  );
  assert.deepEqual(mixed.map((s) => s.id), ['c', 'a', 'b', 'd']);
  assert.equal(mixed[2].deliveryDistanceKm, null);
  assert.equal(mixed[3].deliveryDistanceKm, null);

  // ── Ties are stable (original order preserved) ─────────────────────────────
  const tied = orderStopsByDistance([{ id: 'x' }, { id: 'y' }], [5, 5]);
  assert.deepEqual(tied.map((s) => s.id), ['x', 'y']);

  // ── Rounding + empty input ─────────────────────────────────────────────────
  assert.equal(orderStopsByDistance([{ id: 'r' }], [3.14159])[0].deliveryDistanceKm, 3.14);
  assert.deepEqual(orderStopsByDistance([], []), []);
  // Input is not mutated.
  const original = [{ id: 'z' }];
  orderStopsByDistance(original, [1]);
  assert.equal(original[0].deliveryDistanceKm, undefined);

  console.log('check-batch-ordering: all assertions passed ✔');
}

run();
