// Pure, client-safe pricing helpers. Must mirror the server's authoritative
// wholesale logic in app/api/orders/route.js so the cart/checkout total the
// customer sees matches what they are actually charged.

/**
 * Returns true when a product's wholesale price applies at the given quantity.
 */
export function isWholesaleApplied(product, quantity) {
    return Boolean(
        product?.wholesalePrice &&
        product?.wholesaleMinQty &&
        Number(quantity) >= Number(product.wholesaleMinQty)
    );
}

/**
 * Effective per-unit price for a product at a given quantity — the wholesale
 * price once the minimum wholesale quantity is met, otherwise the retail price.
 */
export function effectiveUnitPrice(product, quantity) {
    return isWholesaleApplied(product, quantity)
        ? product.wholesalePrice
        : product?.price ?? 0;
}
