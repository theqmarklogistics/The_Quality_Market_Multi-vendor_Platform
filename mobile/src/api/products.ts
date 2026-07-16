// Product catalog endpoints (public — no auth required, but the bearer token is
// harmless if present).
import { apiGet } from './client';
import type { Product, ProductListResponse } from './types';

export interface ProductQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  sort?: 'newest' | 'price-low' | 'price-high' | 'rating';
}

export function listProducts(query: ProductQuery = {}): Promise<ProductListResponse> {
  const params: Record<string, string> = {};
  if (query.page) params.page = String(query.page);
  if (query.limit) params.limit = String(query.limit);
  if (query.search) params.search = query.search;
  if (query.category) params.category = query.category;
  if (query.priceMin) params.priceMin = String(query.priceMin);
  if (query.priceMax) params.priceMax = String(query.priceMax);
  if (query.sort) params.sort = query.sort;
  return apiGet<ProductListResponse>('/api/product', { params });
}

export function getProduct(id: string): Promise<{ product: Product }> {
  return apiGet<{ product: Product }>(`/api/product/${id}`);
}

// Public "Best Selling" ranking — products ordered by units sold across paid
// orders, with a newest-products fallback so the rail is never empty. Mirrors
// the web BestSelling section (GET /api/product/best-selling).
export function getBestSelling(limit = 8): Promise<{ products: Product[] }> {
  return apiGet<{ products: Product[] }>('/api/product/best-selling', {
    params: { limit: String(limit) },
  });
}

export interface CategoryRow {
  id?: string;
  name: string;
  // Categories nest up to 3 levels (category → sub → sub-sub) via parentId.
  parentId?: string | null;
}

/**
 * Flatten the (max 3-level) category tree depth-first into picker options with
 * indented labels: "Electronics", "— Phones", "—— Smartphones". The saved value
 * is always the plain `name`.
 */
export function flattenCategoryTree(rows: CategoryRow[]): { name: string; label: string }[] {
  const byParent = new Map<string | null, CategoryRow[]>();
  for (const r of rows) {
    const key = r.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(r);
  }
  const out: { name: string; label: string }[] = [];
  const walk = (nodes: CategoryRow[], depth: number) => {
    for (const n of nodes) {
      out.push({ name: n.name, label: depth > 1 ? `${'—'.repeat(depth - 1)} ${n.name}` : n.name });
      if (n.id) walk(byParent.get(n.id) ?? [], depth + 1);
    }
  };
  walk(byParent.get(null) ?? [], 1);
  return out;
}

// Category list from the backend (admin-configured). Falls back to the ported
// PRODUCT_CATEGORIES constant in the UI if this is empty.
export function getCategories(): Promise<{ categories: CategoryRow[] }> {
  return apiGet<{ categories: CategoryRow[] }>('/api/categories');
}
