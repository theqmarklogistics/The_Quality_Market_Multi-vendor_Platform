// Coupon verification. Returns the coupon (with `discount` as a percent) or throws
// an ApiError (e.g. "Coupon not found", "Coupon valid for new users only").
import { apiPost } from './client';
import type { Coupon } from './types';

export function verifyCoupon(code: string): Promise<{ coupon: Coupon }> {
  return apiPost<{ coupon: Coupon }>('/api/coupon', { code: code.trim().toUpperCase() });
}
