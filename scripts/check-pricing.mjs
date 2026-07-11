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

// Local Seller: same zone × weight tariff — shipping is charged at checkout.
const localSellerClient = {
  store: { findUnique: async () => ({ sellerModel: 'LOCAL_SELLER', latitude: null, longitude: null }) },
  weightShippingRate: { findFirst: async () => ({ cost: 1200 }) },
};

// Local Seller with no tariff rows configured: falls back to the delivery-service
// flat base fee so shipping is still charged at checkout.
const localSellerNoTariffClient = {
  store: { findUnique: async () => ({ sellerModel: 'LOCAL_SELLER', latitude: null, longitude: null }) },
  weightShippingRate: { findFirst: async () => null },
  externalDeliveryConfig: { findUnique: async () => ({ basePrice: 2500, perSector: {} }) },
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

  // Local Seller: zone × weight tariff, charged at checkout (weightless items
  // bill at 1 kg/unit so the fee is never 0).
  const local = await calculateOrderShippingForStore(
    localSellerClient,
    'store-1',
    { sector: 'Kicukiro' },
    [{ quantity: 1, weightKg: null, lengthCm: null, widthCm: null, heightCm: null, importOrigin: null }]
  );
  assert.equal(local.cost, 1200);
  assert.equal(local.shippingQuoted, true);

  // Local Seller without tariff rows: flat delivery-service base fee, still quoted.
  const localFlat = await calculateOrderShippingForStore(
    localSellerNoTariffClient,
    'store-1',
    { sector: 'Kicukiro' },
    [{ quantity: 1, weightKg: 2, lengthCm: null, widthCm: null, heightCm: null, importOrigin: null }]
  );
  assert.equal(localFlat.cost, 2500);
  assert.equal(localFlat.shippingQuoted, true);

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
