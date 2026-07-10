// Order endpoints: create, list, and payment-proof upload.
import { api, apiGet, apiPost } from './client';
import type { CreateOrderPayload, Order } from './types';

export function createOrder(
  payload: CreateOrderPayload,
): Promise<{ message: string; orderIds: string[] }> {
  return apiPost<{ message: string; orderIds: string[] }>('/api/orders', payload);
}

export function getOrders(): Promise<{ orders: Order[] }> {
  return apiGet<{ orders: Order[] }>('/api/orders');
}

// Checkout-time Kigali Pooled Delivery fee estimate. Distance comes from the
// pinned checkout point when provided, else the saved address location.
export interface PoolQuote {
  fee: number;
  chargeableKg: number;
  distanceKm: number | null;
  basis: 'formula' | 'flat';
}

export function getPoolQuote(payload: {
  addressId: string;
  items: { id: string; quantity: number }[];
  lat?: number;
  lng?: number;
}): Promise<PoolQuote> {
  return apiPost<PoolQuote>('/api/delivery/pool-quote', payload);
}

// Local file (from expo-image-picker) to upload as the payment proof.
export interface ProofFile {
  uri: string;
  name: string;
  mimeType: string;
}

// Sends multipart/form-data to POST /api/orders/payment-proof. In React Native,
// FormData file parts use { uri, name, type }. Let the runtime set the multipart
// boundary header (don't force application/json).
export async function uploadPaymentProof(
  orderId: string,
  file: ProofFile,
): Promise<{ message: string }> {
  const form = new FormData();
  form.append('orderId', orderId);
  form.append('proofFile', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);

  const res = await api.post<{ message: string }>('/api/orders/payment-proof', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}
