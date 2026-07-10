// Client-side price helpers. Mirrors the backend's unit-price rule in
// app/api/orders/route.js: wholesale price applies once qty >= wholesaleMinQty.
// NOTE: shipping/commission/pooled-delivery fees are computed authoritatively by
// the server at order creation — the client only estimates the item subtotal.
import type { Product } from '@/api/types';

type Priced = Pick<Product, 'price' | 'wholesalePrice' | 'wholesaleMinQty'>;

// True once the wholesale price kicks in at the given quantity — used to badge
// the cart line and hide the "buy N+" hint once it no longer applies.
export function isWholesaleApplied(product: Priced, qty: number): boolean {
  return Boolean(
    product.wholesalePrice && product.wholesaleMinQty && qty >= product.wholesaleMinQty,
  );
}

export function unitPrice(product: Priced, qty: number): number {
  return isWholesaleApplied(product, qty) ? product.wholesalePrice! : product.price;
}

export function lineTotal(product: Product, qty: number): number {
  return unitPrice(product, qty) * qty;
}
