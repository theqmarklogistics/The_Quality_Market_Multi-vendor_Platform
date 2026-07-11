// External-seller (delivery partner) endpoints. All hit /api/delivery/external/**
// with the Clerk bearer token injected by the API client. Mirrors the web's
// components/external/ExternalDashboard + ExternalBookingForm. Booking pushes a
// delivery-only order through the Kigali pooled pipeline; payment proof reuses the
// shared /api/orders/payment-proof route (see src/api/orders.ts → uploadPaymentProof).
import { apiGet, apiPost, getAuthToken } from './client';
import { API_URL } from '@/constants';
import type { PaymentMethod } from '@/constants';
// SDK 54+ moved cacheDirectory/downloadAsync to the legacy entry point.
import * as FileSystem from 'expo-file-system/legacy';

export type ExternalPaymentProofStatus =
  | 'NOT_SUBMITTED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED';

export interface ExternalDelivery {
  orderId: string;
  createdAt: string;
  total: number;
  creditApplied: number;
  amountDue: number;
  poolingSavings: number | null;
  paymentStatus: string;
  paymentProofStatus: ExternalPaymentProofStatus;
  isPaid: boolean;
  deliveryStatus: string | null;
  intakeMethod: string | null;
  deliveryOtp: string | null;
  trackingToken: string | null;
  packageDescription: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientSector: string | null;
}

export interface ExternalDashboard {
  creditBalance: number;
  deliveries: ExternalDelivery[];
}

export function getExternalDeliveries(): Promise<ExternalDashboard> {
  return apiGet<ExternalDashboard>('/api/delivery/external');
}

// ── Live quote ─────────────────────────────────────────────────────────────
export interface QuoteParams {
  sector?: string;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  dropLat?: number;
  dropLng?: number;
}

export interface DeliveryQuote {
  fee: number;
  chargeableKg?: number;
  distanceKm?: number;
  basis: 'formula' | 'flat' | string;
}

export function quoteExternalDelivery(params: QuoteParams): Promise<DeliveryQuote> {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q[k] = String(v);
  }
  return apiGet<DeliveryQuote>('/api/delivery/external/quote', { params: q });
}

// ── Booking ────────────────────────────────────────────────────────────────
export interface ExternalBookingPayload {
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  recipientSector: string;
  recipientLandmark: string;
  // Optional — when omitted, the client shares their location through the
  // tracking link and the fee is re-priced from those coordinates.
  recipientLat?: number;
  recipientLng?: number;
  intakeMethod: 'HUB_DROP_OFF' | 'DRIVER_SWEEP';
  pickupContactName?: string;
  pickupPhone?: string;
  pickupLandmark?: string;
  // When set (e.g. a rider recording a walk-up package in the field), the
  // delivery distance — and fee — is measured from here instead of the hub.
  pickupLat?: number;
  pickupLng?: number;
  packageDescription?: string;
  declaredValue?: number;
  packageWeightKg?: number;
  packageLengthCm?: number;
  packageWidthCm?: number;
  packageHeightCm?: number;
  paymentMethod: PaymentMethod;
  applyCredit: boolean;
}

export interface BookingResult {
  success: boolean;
  orderId: string;
  fee: number;
  creditApplied: number;
  amountDue: number;
  fullyCovered: boolean;
  trackingToken: string;
  deliveryOtp: string;
}

export function bookExternalDelivery(
  payload: ExternalBookingPayload,
): Promise<BookingResult> {
  return apiPost<BookingResult>('/api/delivery/external', payload);
}

// The public, token-scoped tracking link for a delivery — safe to share with the
// recipient (no auth needed). Matches the QR encoded on the printed label.
export function trackingLink(orderId: string, token: string | null): string {
  return `${API_URL}/track/${orderId}${token ? `?t=${token}` : ''}`;
}

// Download the label PDF to a local cache file. The label route is auth-gated, so
// we attach the bearer token on this direct (non-axios) download. Returns the local
// file URI; the caller then shares/opens it.
export async function downloadLabel(orderId: string): Promise<string> {
  const token = await getAuthToken();
  const target = `${FileSystem.cacheDirectory}external-label-${orderId}.pdf`;
  const res = await FileSystem.downloadAsync(
    `${API_URL}/api/delivery/external/label/${orderId}`,
    target,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );
  if (res.status !== 200) {
    throw new Error('Could not download the label. Please try again.');
  }
  return res.uri;
}
