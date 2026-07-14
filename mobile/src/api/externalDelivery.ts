// External-seller (delivery partner) endpoints. All hit /api/delivery/external/**
// with the Clerk bearer token injected by the API client. Mirrors the web's
// components/external/ExternalDashboard + ExternalBookingForm. Booking pushes a
// delivery-only order through the Kigali pooled pipeline; payment proof reuses the
// shared /api/orders/payment-proof route (see src/api/orders.ts → uploadPaymentProof).
import { apiGet, apiPost } from './client';
import { API_URL } from '@/constants';
import type { PaymentMethod } from '@/constants';

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
  // Pickup/rider origin — overrides the hub as the distance origin.
  originLat?: number;
  originLng?: number;
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
  // Package sender — printed on the delivery documents.
  senderName: string;
  senderPhone: string;
  senderEmail: string;
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  // Official administrative location, recorded down to the cell level.
  recipientDistrict: string;
  recipientSector: string;
  recipientCell: string;
  recipientVillage?: string;
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
// (Label/invoice/receipt PDFs are staff-issued and not downloadable by partners.)
export function trackingLink(orderId: string, token: string | null): string {
  return `${API_URL}/track/${orderId}${token ? `?t=${token}` : ''}`;
}
