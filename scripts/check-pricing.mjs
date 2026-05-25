import assert from 'node:assert/strict';
import { calculateItemCommission, calculateShippingForStore } from '../lib/pricing.js';

const commissionClient = {
  categoryCommission: {
    findFirst: async () => ({
      id: 'comm-1',
      category: 'Electronics',
      percent: 5,
      fixedAmount: 2,
    }),
  },
  shippingRule: {
    findFirst: async () => null,
  },
  store: {
    findUnique: async () => null,
  },
};

const shippingClient = {
  categoryCommission: {
    findFirst: async () => null,
  },
  shippingRule: {
    findFirst: async ({ where }) => {
      if (where.type === 'REGION') {
        return {
          id: 'ship-region',
          type: 'REGION',
          regionKey: 'Kicukiro',
          flatRate: 1500,
          perKmRate: null,
        };
      }
      if (where.type === 'DEFAULT') {
        return {
          id: 'ship-default',
          type: 'DEFAULT',
          flatRate: 500,
          perKmRate: null,
        };
      }
      return null;
    },
  },
  store: {
    findUnique: async () => ({ latitude: 0, longitude: 0 }),
  },
};

async function run() {
  const commission = await calculateItemCommission(commissionClient, { category: 'Electronics' }, 100);
  assert.equal(commission.commissionAmount, 7);
  assert.equal(commission.commissionRate, 5);
  assert.equal(commission.fixedAmount, 2);

  const regionShipping = await calculateShippingForStore(shippingClient, 'store-1', { district: 'Kicukiro' });
  assert.equal(regionShipping.cost, 1500);
  assert.equal(regionShipping.ruleId, 'ship-region');

  const defaultShipping = await calculateShippingForStore(shippingClient, 'store-1', {});
  assert.equal(defaultShipping.cost, 500);
  assert.equal(defaultShipping.ruleId, 'ship-default');

  console.log('pricing checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});