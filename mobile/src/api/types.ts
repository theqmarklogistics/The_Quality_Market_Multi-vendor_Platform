// Shapes returned by the backend API (subset of the Prisma models, matching the
// `select`/response shapes in app/api/**). Kept minimal to what the app consumes.
import type {
  DeliveryType,
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@/constants';

export interface StoreSummary {
  id: string;
  name: string;
  username: string;
  logo: string | null;
  isActive: boolean;
}

export interface Rating {
  rating: number;
  review: string | null;
  createdAt: string;
  user: { name: string | null; image: string | null } | null;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  mrp: number | null;
  price: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number | null;
  images: string[];
  category: string;
  inStock: boolean;
  createdAt: string;
  rating: Rating[];
  store: StoreSummary | null;
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
}

export interface Address {
  id: string;
  userId: string;
  name: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  district: string | null;
  sector: string | null;
  cell: string | null;
  village: string | null;
  createdAt: string;
}

// Fields collected by the add-address form. Either a pinned lat/long OR the
// administrative address down to the cell is required (the backend geocodes
// the cell/village into an approximate point when there is no pin).
export interface AddressInput {
  name: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  latitude?: number;
  longitude?: number;
}

export interface Coupon {
  code: string;
  description: string;
  discount: number; // percent
  forNewUser: boolean;
  isPublic: boolean;
  expiresAt: string;
  maxUses: number | null;
  usedCount: number;
}

export interface OrderItem {
  id: number | string;
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
  product: Product | null;
}

export interface Order {
  id: string;
  total: number;
  status: OrderStatus;
  storeId: string | null;
  addressId: string;
  isPaid: boolean;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentProofUrl: string | null;
  paymentProofStatus:
    | 'NOT_SUBMITTED'
    | 'SUBMITTED'
    | 'APPROVED'
    | 'REJECTED';
  paymentProofNotes: string | null;
  shippingCost: number | null;
  shippingQuoted: boolean;
  invoiceRequested: boolean;
  invoiceStatus: string | null;
  deliveryType: DeliveryType;
  landmarkAddress: string | null;
  deliveryStatus: DeliveryStatus | null;
  deliveryOtp: string | null;
  createdAt: string;
  updatedAt: string;
  orderItems: OrderItem[];
  address: Address | null;
  returnRequest: unknown | null;
}

export interface PaymentConfig {
  momoPayCode: string | null;
  momoAccountName: string | null;
  momoConfigured: boolean;
  bankConfigured: boolean;
  ekashNumber: string | null;
  ekashAccountName: string | null;
  ekashConfigured: boolean;
}

// Payload for POST /api/orders.
export interface CreateOrderPayload {
  items: { id: string; quantity: number }[];
  addressId: string;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  deliveryType: DeliveryType;
  landmarkAddress?: string;
  recipientLat?: number;
  recipientLng?: number;
  // Mandatory at checkout (server falls back to the address phone if omitted).
  contactPhone?: string;
}
