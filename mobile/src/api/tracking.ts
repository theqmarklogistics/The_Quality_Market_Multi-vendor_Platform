// Pooled-delivery live tracking. The GET returns a full snapshot; live updates also
// arrive over Socket.IO (rider-location-update / delivery-status-update). The customer
// can opt in to share their own live location so the rider can find them.
import { apiGet, apiPost } from './client';
import type { DeliveryStatus } from '@/constants';

export interface TrackingSnapshot {
  orderId: string;
  deliveryStatus: DeliveryStatus | null;
  escrowStatus: string | null;
  intakeMethod: string | null;
  landmarkAddress: string | null;
  deliveryOtp: string | null;
  deliveryFeeShare: number | null;
  corridorId: string | null;
  corridorStatus: string | null;
  stopSequence: number | null;
  failureReason: string | null;
  deliveredAt: string | null;
  podPhotoUrl: string | null;
  riderLat: number | null;
  riderLng: number | null;
  riderLocationAt: string | null;
  recipientLat: number | null;
  recipientLng: number | null;
  hubDistanceKm: number | null;
  etaMinutes: number | null;
  // GeoJSON LineString coordinates [[lng, lat], ...] from OSRM, when available.
  routeGeometry: { type: string; coordinates: [number, number][] } | null;
  rider: { name: string | null; phone: string | null; vehicleType: string | null } | null;
  store: { name: string; logo: string | null } | null;
  isExternalDelivery: boolean;
  packageDescription: string | null;
  senderName: string | null;
  address: { name?: string; street?: string; sector?: string; city?: string };
  createdAt: string;
}

export function getTracking(orderId: string): Promise<TrackingSnapshot> {
  return apiGet<TrackingSnapshot>(`/api/delivery/track/${orderId}`);
}

export function shareMyLocation(
  orderId: string,
  lat: number,
  lng: number,
): Promise<{ success: boolean; at: string }> {
  return apiPost(`/api/delivery/track/${orderId}/share-location`, { lat, lng });
}
