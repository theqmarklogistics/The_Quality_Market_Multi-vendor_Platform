// Admin & logistics (ops) console endpoints. All hit the existing backend with the
// Clerk bearer token injected by the API client — no server-side auth changes.
// Mirrors the web admin dashboard (app/admin/**) and logistics dispatch board
// (app/api/logistics/**). The backend's authAdmin / authLogistics gates still apply;
// the role gate in useMyRole only decides whether to surface the entry points.
import { apiGet, apiPost } from './client';
import type { OrderItem } from './types';

// ── Dashboard (admin only) ───────────────────────────────────────────────────
export interface AdminDashboard {
  orders: number;
  newOrders: number;
  stores: number;
  pendingStores: number;
  revenue: string;
  products: number;
  pendingProducts: number;
  pendingPaymentProofs: number;
  unreadChatMessages: number;
  pendingInvoiceRequests: number;
  allOrders: { createdAt: string; total: number }[];
}

export function getAdminDashboard(): Promise<AdminDashboard> {
  return apiGet<AdminDashboard>('/api/admin/dashboard');
}

// ── Payment-proof review (admin only) ────────────────────────────────────────
export type ProofStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NOT_SUBMITTED';

export interface PaymentReviewOrder {
  id: string;
  total: number;
  paymentMethod: string | null;
  paymentProofUrl: string | null;
  paymentProofStatus: ProofStatus;
  paymentProofNotes: string | null;
  isExternalDelivery?: boolean;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null } | null;
  store: { id: string; name: string } | null;
  orderItems: OrderItem[];
}

export interface PaymentReviewList {
  orders: PaymentReviewOrder[];
  total: number;
  page: number;
  pages: number;
}

export function listPaymentProofs(
  params: { page?: number; proofStatus?: ProofStatus } = {},
): Promise<PaymentReviewList> {
  const q: Record<string, string> = {};
  if (params.page) q.page = String(params.page);
  q.proofStatus = params.proofStatus ?? 'SUBMITTED';
  return apiGet<PaymentReviewList>('/api/admin/payments', { params: q });
}

// Approve or reject a submitted payment proof. APPROVED marks the order paid.
export function reviewPaymentProof(
  orderId: string,
  status: 'APPROVED' | 'REJECTED',
  notes?: string,
): Promise<{ message: string }> {
  return apiPost<{ message: string }>('/api/admin/payments', { orderId, status, notes });
}

// ── Store approvals (admin only) ─────────────────────────────────────────────
export interface PendingStore {
  id: string;
  name: string;
  username: string;
  description: string | null;
  address: string | null;
  email: string | null;
  contact: string | null;
  logo: string | null;
  status: string; // 'pending' | 'rejected'
  rejectionNotes: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null } | null;
}

// GET returns pending + rejected stores awaiting a decision.
export function listPendingStores(): Promise<{ stores: PendingStore[] }> {
  return apiGet<{ stores: PendingStore[] }>('/api/admin/approve-store');
}

// Approve or reject a store. Rejection notes are emailed to the owner.
export function reviewStore(
  storeId: string,
  status: 'approved' | 'rejected',
  notes?: string,
): Promise<{ message: string }> {
  return apiPost<{ message: string }>('/api/admin/approve-store', { storeId, status, notes });
}

// ── Logistics: dispatch board (admin or logistics manager) ───────────────────
export type CorridorStatus = 'OPEN' | 'CLOSED' | 'IN_TRANSIT' | 'COMPLETED';

export interface CorridorStop {
  orderId: string;
  stopSequence: number | null;
  deliveryStatus: string;
  intakeMethod: string | null;
  storeName: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  sector: string | null;
  landmarkAddress: string | null;
  lat: number | null;
  lng: number | null;
  deliveryFeeShare: number | null;
}

export interface Corridor {
  id: string;
  name: string;
  status: CorridorStatus;
  runDate: string;
  dispatchedAt: string | null;
  completedAt: string | null;
  riderLat: number | null;
  riderLng: number | null;
  riderLocationAt: string | null;
  rider: { id: string; name: string | null; phone: string | null } | null;
  stops: CorridorStop[];
}

// GET corridors running on a given day (YYYY-MM-DD; defaults to today server-side).
export function listCorridors(date?: string): Promise<{ corridors: Corridor[] }> {
  return apiGet<{ corridors: Corridor[] }>('/api/logistics/corridors', {
    params: date ? { date } : undefined,
  });
}

export interface BatchResult {
  success: boolean;
  corridors?: number;
  batched?: number;
  [key: string]: unknown;
}

// Run the pooled-delivery batching engine now — sweeps sorted, un-corridored
// pooled orders into route corridors instead of waiting for the next wave.
export function runBatch(): Promise<BatchResult> {
  return apiPost<BatchResult>('/api/logistics/batch');
}

export interface DispatchRider {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  vehicleType: string | null;
  isActive: boolean;
}

export function listDispatchRiders(): Promise<{ riders: DispatchRider[] }> {
  return apiGet<{ riders: DispatchRider[] }>('/api/logistics/riders');
}

// Assign (or, with riderId=null, unassign) a rider to a corridor.
export function assignRider(
  corridorId: string,
  riderId: string | null,
): Promise<{ success: boolean; corridorId: string; riderId: string | null }> {
  return apiPost(`/api/logistics/corridors/${corridorId}/assign-rider`, { riderId });
}

// Drive a corridor through its dispatch lifecycle.
//   dispatch → IN_TRANSIT (requires an assigned rider)
//   complete → COMPLETED   close → CLOSED   open → OPEN
export function setCorridorStatus(
  corridorId: string,
  action: 'dispatch' | 'complete' | 'close' | 'open',
): Promise<{ success: boolean; corridorId: string; status: CorridorStatus }> {
  return apiPost(`/api/logistics/corridors/${corridorId}/status`, { action });
}

export interface PoolableOrder {
  orderId: string;
  deliveryStatus: string;
  intakeMethod: string | null;
  createdAt: string;
  storeName: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  sector: string | null;
  landmarkAddress: string | null;
  isExternalDelivery: boolean;
  packageDescription: string | null;
  // Unpaid external bookings can be intaken/sorted but the batcher holds them
  // out of routing until paid.
  paymentPending: boolean;
}

// Un-corridored Kigali pooled orders awaiting batching (what the batcher draws from).
export function listPoolableOrders(): Promise<{ orders: PoolableOrder[] }> {
  return apiGet<{ orders: PoolableOrder[] }>('/api/logistics/orders/poolable');
}

// Mark a package sorted at the hub (PENDING_INTAKE → SORTING) so the batcher can
// sweep it into a corridor.
export function markOrderIntake(orderId: string): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>(`/api/logistics/orders/${orderId}/intake`, {});
}
