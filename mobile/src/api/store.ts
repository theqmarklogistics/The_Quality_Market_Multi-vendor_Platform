// Seller console endpoints. All hit the existing backend under /api/store/** with
// the Clerk bearer token injected by the API client — no server-side auth changes.
// Mirrors the web seller dashboard (app/store/**). The backend's authSeller gate
// enforces an approved, active store; getSellerStatus surfaces why if not.
import { api, apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { Address, OrderItem } from './types';
import type { OrderStatus, PaymentStatus, DeliveryType } from '@/constants';

// ── Access status (mirrors authSeller reasons) ─────────────────────────────
export interface SellerStatus {
  isSeller: boolean;
  reason?:
    | 'unauthenticated'
    | 'user_not_found'
    | 'no_store'
    | 'store_pending'
    | 'store_rejected'
    | 'store_inactive'
    | 'error'
    | string;
  storeInfo?: {
    id: string;
    name: string;
    username: string;
    status: string;
    isActive: boolean;
    logo: string | null;
    rejectionNotes?: string | null;
  } | null;
}

export function getSellerStatus(): Promise<SellerStatus> {
  return apiGet<SellerStatus>('/api/store/is-seller');
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export interface SellerRating {
  rating: number;
  review: string | null;
  createdAt: string;
  user: { id?: string; name: string | null; image: string | null } | null;
  product: { id: string; name: string; category?: string } | null;
}

export interface LowStockProduct {
  id: string;
  name: string;
  warehouseQuantity: number;
  inStock: boolean;
}

export interface SellerDashboard {
  totalOrders: number;
  totalProducts: number;
  totalEarnings: number;
  ratings: SellerRating[];
  lowStockProducts: LowStockProduct[];
}

export function getSellerDashboard(): Promise<SellerDashboard> {
  return apiGet<SellerDashboard>('/api/store/dashboard');
}

// ── Products ───────────────────────────────────────────────────────────────
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SellerProduct {
  id: string;
  name: string;
  description: string;
  mrp: number;
  price: number;
  warehouseQuantity: number;
  category: string;
  images: string[];
  inStock: boolean;
  approvalStatus: ApprovalStatus;
  approvalNotes: string | null;
  wholesalePrice: number | null;
  wholesaleMinQty: number | null;
  createdAt: string;
}

export interface SellerProductList {
  products: SellerProduct[];
  total: number;
  page: number;
  pages: number;
}

export function listSellerProducts(
  params: { page?: number; search?: string; status?: ApprovalStatus | '' } = {},
): Promise<SellerProductList> {
  const q: Record<string, string> = {};
  if (params.page) q.page = String(params.page);
  if (params.search) q.search = params.search;
  if (params.status) q.status = params.status;
  return apiGet<SellerProductList>('/api/store/product', { params: q });
}

export function getSellerProduct(id: string): Promise<SellerProduct> {
  return apiGet<SellerProduct>(`/api/store/product/${id}`);
}

export function toggleStock(productId: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>('/api/store/stock-toggle', { productId });
}

export function deleteSellerProduct(id: string): Promise<{ message: string }> {
  return apiDelete<{ message: string }>(`/api/store/product/${id}`);
}

// AI listing helper: analyze a product photo (base64) → suggested name + description.
export function analyzeProductImage(
  base64Image: string,
  mimeType: string,
): Promise<{ name?: string; description?: string }> {
  return apiPost<{ name?: string; description?: string }>('/api/store/ai', {
    base64Image,
    mimeType,
  });
}

// A local image (from expo-image-picker) to attach to a product.
export interface ProductImageFile {
  uri: string;
  name: string;
  mimeType: string;
}

// The editable fields collected by the add/edit form. Numbers are strings as typed.
export interface ProductFormValues {
  name: string;
  description: string;
  mrp: string;
  price: string;
  warehouseQuantity: string;
  category: string;
  wholesalePrice?: string;
  wholesaleMinQty?: string;
  weightKg?: string;
  lengthCm?: string;
  widthCm?: string;
  heightCm?: string;
  importOrigin?: string;
}

function appendCommon(form: FormData, v: ProductFormValues): void {
  form.append('name', v.name);
  form.append('description', v.description);
  form.append('mrp', v.mrp);
  form.append('price', v.price);
  form.append('warehouseQuantity', v.warehouseQuantity);
  form.append('category', v.category);
  if (v.wholesalePrice) form.append('wholesalePrice', v.wholesalePrice);
  if (v.wholesaleMinQty) form.append('wholesaleMinQty', v.wholesaleMinQty);
}

function appendImage(form: FormData, img: ProductImageFile): void {
  form.append('images', {
    uri: img.uri,
    name: img.name,
    type: img.mimeType,
  } as unknown as Blob);
}

// Create a product (resubmits to admin approval). Multipart — let the runtime set
// the boundary header.
export async function createSellerProduct(
  values: ProductFormValues,
  images: ProductImageFile[],
): Promise<{ message: string }> {
  const form = new FormData();
  appendCommon(form, values);
  if (values.weightKg) form.append('weightKg', values.weightKg);
  if (values.lengthCm) form.append('lengthCm', values.lengthCm);
  if (values.widthCm) form.append('widthCm', values.widthCm);
  if (values.heightCm) form.append('heightCm', values.heightCm);
  if (values.importOrigin) form.append('importOrigin', values.importOrigin);
  images.forEach((img) => appendImage(form, img));
  const res = await api.post<{ message: string }>('/api/store/product', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// Update a product. Keeps `existingImages` (URLs) and appends any newly-picked files;
// the update resubmits the product for approval (backend resets approvalStatus).
export async function updateSellerProduct(
  id: string,
  values: ProductFormValues,
  existingImages: string[],
  newImages: ProductImageFile[],
): Promise<{ message: string }> {
  const form = new FormData();
  appendCommon(form, values);
  form.append('existingImages', JSON.stringify(existingImages));
  newImages.forEach((img) => appendImage(form, img));
  const res = await api.patch<{ message: string }>(`/api/store/product/${id}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// ── Orders ─────────────────────────────────────────────────────────────────
export interface SellerOrder {
  id: string;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus | null;
  isPaid: boolean;
  shippingCost: number | null;
  shippingQuoted: boolean;
  deliveryType: DeliveryType;
  intakeMethod: 'HUB_DROP_OFF' | 'DRIVER_SWEEP' | null;
  landmarkAddress: string | null;
  publicStatusNote: string | null;
  customStatusLabel: string | null;
  createdAt: string;
  orderItems: OrderItem[];
  user: { id: string; name: string | null; email: string | null } | null;
  address: Address | null;
}

export interface SellerOrderList {
  orders: SellerOrder[];
  total: number;
  page: number;
  pages: number;
}

export function listSellerOrders(
  params: { page?: number; search?: string; status?: OrderStatus | '' } = {},
): Promise<SellerOrderList> {
  const q: Record<string, string> = {};
  if (params.page) q.page = String(params.page);
  if (params.search) q.search = params.search;
  if (params.status) q.status = params.status;
  return apiGet<SellerOrderList>('/api/store/orders', { params: q });
}

// PATCH /api/store/orders/[id]: set status (PROCESSING/SHIPPED), a shipping fee,
// or the pooled-delivery intake method — one concern per call (mirrors the web).
export interface SellerOrderUpdate {
  status?: 'PROCESSING' | 'SHIPPED';
  publicStatusNote?: string | null;
  shippingCost?: number;
  intakeMethod?: 'HUB_DROP_OFF' | 'DRIVER_SWEEP';
}

export function updateSellerOrder(
  id: string,
  body: SellerOrderUpdate,
): Promise<{ message: string; total?: number; shippingCost?: number }> {
  return apiPatch<{ message: string; total?: number; shippingCost?: number }>(
    `/api/store/orders/${id}`,
    body,
  );
}

// ── Payouts ────────────────────────────────────────────────────────────────
export interface Payout {
  id: string;
  amount: number;
  status: 'PENDING' | 'PAID' | string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

export function getPayouts(): Promise<{ payouts: Payout[] }> {
  return apiGet<{ payouts: Payout[] }>('/api/store/payouts');
}
