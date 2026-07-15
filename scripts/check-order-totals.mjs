import assert from 'node:assert/strict';
import { computeOrderTotal, shippingCostForOrder } from '../lib/orderTotals.js';

function run() {
  // ── Standard delivery ships FREE, whatever the quoted fee was ─────────────
  assert.equal(shippingCostForOrder('STANDARD_UNPOOLED', 3500), 0);
  assert.equal(shippingCostForOrder('STANDARD_UNPOOLED', 0), 0);
  assert.equal(shippingCostForOrder(undefined, 2000), 0); // unknown type → free (standard)

  // Pooled delivery still pays the quoted fee.
  assert.equal(shippingCostForOrder('KIGALI_POOL', 3500), 3500);
  assert.equal(shippingCostForOrder('KIGALI_POOL', -5), 0); // never negative
  assert.equal(shippingCostForOrder('KIGALI_POOL', 2000.005), 2000.01); // 2dp

  // ── Grand total with Standard selected: subtotal − coupon + 0 ─────────────
  const standardShipping = shippingCostForOrder('STANDARD_UNPOOLED', 2800);
  assert.equal(
    computeOrderTotal({ itemsSubtotal: 10000, couponPercent: 0, shippingCost: standardShipping }),
    10000
  );
  assert.equal(
    computeOrderTotal({ itemsSubtotal: 10000, couponPercent: 20, shippingCost: standardShipping }),
    8000
  );

  // ── Pooled/other tiers unaffected: shipping still added on top ────────────
  assert.equal(
    computeOrderTotal({ itemsSubtotal: 10000, couponPercent: 0, shippingCost: 2500 }),
    12500
  );
  // Coupon discounts items only — never the shipping fee.
  assert.equal(
    computeOrderTotal({ itemsSubtotal: 10000, couponPercent: 10, shippingCost: 2500 }),
    11500
  );

  // ── Edge cases ─────────────────────────────────────────────────────────────
  assert.equal(computeOrderTotal({ itemsSubtotal: 0, couponPercent: 50, shippingCost: 0 }), 0);
  assert.equal(computeOrderTotal({ itemsSubtotal: 999.99, couponPercent: 0, shippingCost: 0 }), 999.99);
  assert.equal(computeOrderTotal({ itemsSubtotal: 1000, couponPercent: 100, shippingCost: 2000 }), 2000);
  // Rounding stays at 2dp.
  assert.equal(computeOrderTotal({ itemsSubtotal: 3333.335, couponPercent: 0, shippingCost: 0 }), 3333.34);

  console.log('check-order-totals: all assertions passed ✔');
}

run();
