// Rider console endpoints. All hit the existing backend under /api/delivery/rider
// (plus /api/delivery/verify-otp) with the Clerk bearer token injected by the API
// client — no server-side auth changes. Mirrors components/rider/RiderConsole.jsx.
import { api, apiGet, apiPost } from './client';
import type { DeliveryStatus } from '@/constants';

// A single delivery stop on the rider's corridor (shape from the assignment route's
// `stops` projection — never includes the OTP; the rider types what the customer shows).
export interface RiderStop {
  orderId: string;
  stopSequence: number;
  deliveryStatus: DeliveryStatus;
  storeName: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  street: string | null;
  sector: string | null;
  city: string | null;
  landmarkAddress: string | null;
  // Pinned/live customer location for navigation; falls back to saved address geo.
  lat: number | null;
  lng: number | null;
  deliveryFeeShare: number | null;
}

export interface RiderCorridor {
  id: string;
  name: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'IN_TRANSIT' | 'COMPLETED' | string;
  runDate: string | null;
  dispatchedAt: string | null;
  riderLat: number | null;
  riderLng: number | null;
  riderLocationAt: string | null;
}

export interface RiderAssignment {
  corridor: RiderCorridor | null;
  stops: RiderStop[];
}

// GET the rider's active corridor for today, with ordered stops.
export function getRiderAssignment(): Promise<RiderAssignment> {
  return apiGet<RiderAssignment>('/api/delivery/rider/assignment');
}

// POST a live GPS tick. The backend persists a last-known snapshot and fans the
// update out to the corridor/track/logistics rooms. Client throttles to ~10s.
export function postRiderLocation(
  lat: number,
  lng: number,
): Promise<{ success: boolean; at: string }> {
  return apiPost<{ success: boolean; at: string }>('/api/delivery/rider/location', { lat, lng });
}

// Per-stop status the rider may set directly (DELIVERED goes through verify-otp /
// confirm-photo). `failureReason` is required by convention when status === 'FAILED'.
export function setStopStatus(
  orderId: string,
  status: 'ARRIVING' | 'FAILED',
  failureReason?: string,
): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>('/api/delivery/rider/stop-status', {
    orderId,
    status,
    failureReason,
  });
}

// Confirm delivery with the 4-digit code the customer shows. Settles escrow + payout.
export function verifyDeliveryOtp(
  orderId: string,
  inputOtp: string,
): Promise<{ success: boolean; message: string }> {
  return apiPost<{ success: boolean; message: string }>('/api/delivery/verify-otp', {
    orderId,
    inputOtp,
  });
}

// Local photo (from expo-image-picker) used as proof of delivery.
export interface PodFile {
  uri: string;
  name: string;
  mimeType: string;
}

// Fallback when the recipient can't provide the OTP: confirm with a captured photo.
// Same settlement as verify-otp. Multipart upload; let the runtime set the boundary.
export async function confirmDeliveryWithPhoto(
  orderId: string,
  file: PodFile,
): Promise<{ success: boolean; message: string; podPhotoUrl: string }> {
  const form = new FormData();
  form.append('orderId', orderId);
  form.append('photoFile', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);

  const res = await api.post<{ success: boolean; message: string; podPhotoUrl: string }>(
    '/api/delivery/rider/confirm-photo',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return res.data;
}
