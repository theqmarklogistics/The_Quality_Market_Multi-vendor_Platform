// Cart endpoints. The cart is a { productId: quantity } map persisted on the user.
import { apiGet, apiPost } from './client';

export type CartItems = Record<string, number>;

export function getCart(): Promise<{ cart: CartItems }> {
  return apiGet<{ cart: CartItems }>('/api/cart');
}

// The backend stores the raw map as the request body (see app/api/cart/route.js).
export function uploadCart(cartItems: CartItems): Promise<{ message: string }> {
  return apiPost<{ message: string }>('/api/cart', cartItems);
}
