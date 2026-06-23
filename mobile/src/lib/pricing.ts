// Client-side price helpers. Mirrors the backend's unit-price rule in
// app/api/orders/route.js: wholesale price applies once qty >= wholesaleMinQty.
// NOTE: shipping/commission/pooled-delivery fees are computed authoritatively by
// the server at order creation — the client only estimates the item subtotal.
import type { Product } from '@/api/types';

export function unitPrice(product: Pick<Product, 'price' | 'wholesalePrice' | 'wholesaleMinQty'>, qty: number): number {
  if (product.wholesalePrice && product.wholesaleMinQty && qty >= product.wholesaleMinQty) {
    return product.wholesalePrice;
  }
  return product.price;
}

export function lineTotal(product: Product, qty: number): number {
  return unitPrice(product, qty) * qty;
}
