// Authoritative order-total math, shared by order creation and the checkout
// shipping quote (and unit-tested in scripts/check-order-totals.mjs).
//
// Policy (2026-07-16): every delivery type — standard, Kigali pooled, and
// external bookings — is priced by the segmented distance-taper + weight-range
// formula (lib/deliveryPricing.js). Standard delivery is no longer free.

/**
 * Shipping cost persisted/charged for a shop order — the quoted fee for every
 * delivery type. `quotedFee` of 0 (e.g. a manual-review order awaiting a fee)
 * persists as 0 until admin sets it.
 */
export function shippingCostForOrder(deliveryType, quotedFee) {
    return round2(Math.max(0, Number(quotedFee) || 0));
}

/**
 * Grand total for one store's order:
 *   (items subtotal − coupon%) + shipping.
 * The coupon applies to the items subtotal only, never to shipping — this
 * mirrors the checkout UI and the invoice PDF.
 */
export function computeOrderTotal({ itemsSubtotal, couponPercent = 0, shippingCost = 0 }) {
    const subtotal = Math.max(0, Number(itemsSubtotal) || 0);
    const pct = Math.min(100, Math.max(0, Number(couponPercent) || 0));
    const shipping = Math.max(0, Number(shippingCost) || 0);
    return round2(subtotal - (subtotal * pct) / 100 + shipping);
}

function round2(n) {
    return parseFloat(Number(n || 0).toFixed(2));
}
