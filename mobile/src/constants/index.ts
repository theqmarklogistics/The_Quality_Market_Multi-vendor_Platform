// Shared enums/constants ported from the web app's lib/constants.js.
// Keep these in sync with prisma/schema.prisma and lib/constants.js on the backend.

import Constants from 'expo-constants';

// Currency symbol (mirrors NEXT_PUBLIC_CURRENCY_SYMBOL on the web).
export const currencySymbol =
  process.env.EXPO_PUBLIC_CURRENCY_SYMBOL || 'RWF';

export const formatPrice = (amount: number | string | null | undefined): string => {
  const n = Number(amount ?? 0);
  return `${currencySymbol} ${n.toLocaleString()}`;
};

// Base URL of the backend API (no trailing slash). Falls back to expo extra if set.
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'http://localhost:3000'
).replace(/\/+$/, '');

export const SOCKET_ENABLED = process.env.EXPO_PUBLIC_SOCKET_ENABLED === 'true';

// Payment methods (match prisma PaymentMethod). Only BANK_TRANSFER + MTN_MOMO are
// surfaced in checkout today, matching the web's allowedPaymentMethods.
export const PaymentMethod = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  STRIPE: 'STRIPE',
  MTN_MOMO: 'MTN_MOMO',
  AIRTEL_MONEY: 'AIRTEL_MONEY',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const CHECKOUT_PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.MTN_MOMO,
  PaymentMethod.BANK_TRANSFER,
];

// User roles (match prisma UserRole).
export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  SELLER: 'SELLER',
  EXTERNAL_SELLER: 'EXTERNAL_SELLER',
  RIDER: 'RIDER',
  LOGISTICS_MANAGER: 'LOGISTICS_MANAGER',
  FINANCIAL_OPERATIONAL: 'FINANCIAL_OPERATIONAL',
  WAREHOUSE_KEEPER: 'WAREHOUSE_KEEPER',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// Order lifecycle (match prisma OrderStatus).
export const OrderStatus = {
  ORDER_PLACED: 'ORDER_PLACED',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  OTHER: 'OTHER',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

// Pooled-delivery lifecycle (match prisma PoolDeliveryStatus).
export const DeliveryStatus = {
  PENDING_INTAKE: 'PENDING_INTAKE',
  SORTING: 'SORTING',
  IN_TRANSIT: 'IN_TRANSIT',
  ARRIVING: 'ARRIVING',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const DeliveryType = {
  STANDARD_UNPOOLED: 'STANDARD_UNPOOLED',
  KIGALI_POOL: 'KIGALI_POOL',
  // Instant dispatch — skips the pooled batching schedule, express base rate.
  EXPRESS: 'EXPRESS',
} as const;
export type DeliveryType = (typeof DeliveryType)[keyof typeof DeliveryType];

// Kigali sector → delivery zone mapping (ported from lib/constants.js).
export const SECTOR_ZONE_MAP: Record<string, 'A' | 'B' | 'C'> = {
  Nyarugenge: 'A', Muhima: 'A', Kimisagara: 'A',
  Gikondo: 'A', Kicukiro: 'A',
  Kacyiru: 'B', Kimironko: 'B', Remera: 'B',
  Gisozi: 'B', Niboye: 'B', Gatenga: 'B',
  Kanombe: 'B', Masaka: 'B', Mageregere: 'B',
  Kanyinya: 'B', Nyamirambo: 'B', Kimihurura: 'B',
  Gatsata: 'B', Kagarama: 'B', Kigarama: 'B', Rwezamenyo: 'B',
};

// Kigali districts and their official NISR sectors
// (sectors not in SECTOR_ZONE_MAP default to Zone C in pricing).
export const KIGALI_DISTRICTS = ['Gasabo', 'Kicukiro', 'Nyarugenge'];

export const KIGALI_SECTORS: string[] = [
  // Gasabo
  'Bumbogo', 'Gatsata', 'Gikomero', 'Gisozi', 'Jabana', 'Jali', 'Kacyiru',
  'Kimihurura', 'Kimironko', 'Kinyinya', 'Ndera', 'Nduba', 'Remera',
  'Rusororo', 'Rutunga',
  // Kicukiro
  'Gahanga', 'Gatenga', 'Gikondo', 'Kagarama', 'Kanombe', 'Kicukiro',
  'Kigarama', 'Masaka', 'Niboye', 'Nyarugunga',
  // Nyarugenge
  'Gitega', 'Kanyinya', 'Kigali', 'Kimisagara', 'Mageregere', 'Muhima',
  'Nyakabanda', 'Nyamirambo', 'Nyarugenge', 'Rwezamenyo',
].sort();

// Product categories (flat list, ported from categoryTree in lib/constants.js).
export const PRODUCT_CATEGORIES: string[] = [
  'Baby Products',
  'Backpacks, Handbags, and Luggage',
  'Base Equipment Power Tools',
  'Beauty, Health, and Personal Care',
  'Business, Industrial, and Scientific Supplies',
  'Clothing and Accessories',
  'Compact Appliances',
  'Computers',
  'Consumer Electronics',
  'Electronics Accessories',
  'Everything Else',
  'Eyewear',
  'Fine Art',
  'Footwear',
  'Full-Size Appliances',
  'Furniture',
  'Gift Cards',
  'Grocery and Gourmet',
  'Home and Kitchen',
  'Jewelry',
  'Lawn and Garden',
  'Lawn Mowers and Snow Throwers',
  'Mattresses',
  'Musical Instruments and AV Production',
  'Office Products',
  'Pet Products',
  'Sports and Outdoors',
  'Tires',
  'Tools and Home Improvement',
  'Toys and Games',
  'Vegetables',
  'Fruits',
  'Roots and Tubers',
  'Flour',
  'Soft Drink',
  'Alcoholic Beverages',
  'Milk and Milk Products',
  'Eggs',
  'Meats and Meat Products',
];
