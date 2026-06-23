// Product rating/review. Only allowed for products in a DELIVERED order, once each.
import { apiPost } from './client';

export interface RatingPayload {
  orderId: string;
  productId: string;
  rating: number; // 1-5
  review?: string;
}

export function addRating(payload: RatingPayload): Promise<{ message: string }> {
  return apiPost<{ message: string }>('/api/rating', payload);
}
