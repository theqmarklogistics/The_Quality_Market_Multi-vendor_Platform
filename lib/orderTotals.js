// Authoritative order-total math, shared by order creation and the checkout
// shipping quote (and unit-tested in scripts/check-order-totals.mjs).
//
// Policy (2026-07): STANDARD_UNPOOLED delivery ships FREE — the shipping fee is
// always 0. Only Kigali Pooled Delivery (and external delivery bookings, which
// have their own booking flow) carry a shipping charge.

/**
 * Shipping cost persisted/charged for a shop order.
 * Standard delivery is always free; pooled delivery pays the quoted fee.
 */
export function shippingCostForOrder(deliveryType, quotedFee) {
    if (deliveryType === 'KIGALI_POOL') {
        return round2(Math.max(0, Number(quotedFee) || 0));
    }
    return 0;
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
