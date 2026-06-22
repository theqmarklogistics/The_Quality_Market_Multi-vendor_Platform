import assert from 'node:assert/strict';
import {
  calculateItemCommission,
  calculateShippingForStore,
  calculateOrderShippingForStore,
} from '../lib/pricing.js';

// Commission: percent + fixed amount on the item price.
const commissionClient = {
  categoryCommission: {
    findFirst: async () => ({ id: 'comm-1', category: 'Electronics', percent: 5, fixedAmount: 2 }),
  },
};

// Local Seller: shipping is seller-quoted later, so it starts unquoted at 0.
const localSellerClient = {
  store: { findUnique: async () => ({ sellerModel: 'LOCAL_SELLER', latitude: null, longitude: null }) },
};

// Full Managed: zone × weight tariff is auto-calculated and confirmed.
const fullManagedClient = {
  store: { findUnique: async () => ({ sellerModel: 'FULL_MANAGED', latitude: 0, longitude: 0 }) },
  weightShippingRate: { findFirst: async () => ({ cost: 1500 }) },
};

async function run() {
  const commission = await calculateItemCommission(commissionClient, { category: 'Electronics' }, 100);
  assert.equal(commission.commissionAmount, 7);
  assert.equal(commission.commissionRate, 5);
  assert.equal(commission.fixedAmount, 2);

  // Local Seller: cost 0 and shippingQuoted=false (seller sets it from their orders).
  const local = await calculateShippingForStore(localSellerClient, 'store-1', { sector: 'Kicukiro' });
  assert.equal(local.cost, 0);
  assert.equal(local.shippingQuoted, false);

  // Full Managed: Kicukiro = Zone A; a 5 kg item bills against the zone rate (1500).
  const managed = await calculateOrderShippingForStore(
    fullManagedClient,
    'store-1',
    { sector: 'Kicukiro' },
    [{ quantity: 1, weightKg: 5, lengthCm: null, widthCm: null, heightCm: null, importOrigin: null }]
  );
  assert.equal(managed.cost, 1500);
  assert.equal(managed.zone, 'A');
  assert.equal(managed.shippingQuoted, true);

  console.log('pricing checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
