import prismaDefault from './prisma.js';
import { SECTOR_ZONE_MAP } from './constants.js';

const toRadians = (deg) => (deg * Math.PI) / 180;

function haversineDistance(lat1, lon1, lat2, lon2) {
  // returns distance in kilometers
  const R = 6371; // Earth's radius km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Tiny in-process TTL cache (no extra dep) ────────────────────────────────
// CategoryCommission and WeightShippingRate rows change very rarely (admin only),
// but were previously queried per cart item per store at checkout — a multi-store
// cart meant 10+ DB roundtrips on every order POST. This memoizes the findFirst
// results in-process for COMMISSION_TTL_MS / WEIGHT_RATE_TTL_MS, with manual
// invalidation via `invalidatePricingCache()` from admin mutation routes.
//
// Sized for a handful of entries (one per category × sellerModel + one per zone
// × weight-bracket hit). On the rare cache miss we fall through to Prisma.
const COMMISSION_TTL_MS = 60 * 60 * 1000;   // 1 hour
const WEIGHT_RATE_TTL_MS = 60 * 60 * 1000;  // 1 hour
const commissionCache = new Map();   // key: `${category}::${sellerModel || 'null'}` → { value, expiresAt }
const weightRateCache = new Map();   // key: `${zone}::${billedWeightKg}`     → { value, expiresAt }

function cacheGet(map, key) {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(map, key, value, ttlMs) {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Public invalidator — call from admin commission/shipping mutation routes.
export function invalidatePricingCache() {
  commissionCache.clear();
  weightRateCache.clear();
}

async function getActiveCommission(prismaClient, category, sellerModel) {
  const client = prismaClient || prismaDefault;
  if (!category) return null;

  const cacheKey = `${category}::${sellerModel || 'null'}`;
  const cached = cacheGet(commissionCache, cacheKey);
  if (cached !== undefined) return cached;

  const now = new Date();
  const dateFilter = {
    OR: [
      { AND: [{ effectiveFrom: { lte: now } }, { effectiveTo: { gte: now } }] },
      { AND: [{ effectiveFrom: null }, { effectiveTo: null }] },
      { AND: [{ effectiveFrom: { lte: now } }, { effectiveTo: null }] },
      { AND: [{ effectiveFrom: null }, { effectiveTo: { gte: now } }] }
    ]
  };

  // Prefer an exact sellerModel match; fall back to a general (null) rule
  let result = null;
  if (sellerModel) {
    const specific = await client.categoryCommission.findFirst({
      where: { category, sellerModel, ...dateFilter },
      orderBy: { createdAt: 'desc' }
    });
    if (specific) result = specific;
  }

  if (!result) {
    result = await client.categoryCommission.findFirst({
      where: { category, sellerModel: null, ...dateFilter },
      orderBy: { createdAt: 'desc' }
    });
  }

  // Cache even null results so we don't re-query a missing-rule category
  // every checkout — a `null` is treated as 0% commission downstream.
  cacheSet(commissionCache, cacheKey, result, COMMISSION_TTL_MS);
  return result;
}

export async function calculateItemCommission(prismaClient, product, price, sellerModel) {
  const client = prismaClient || prismaDefault;
  const category = product?.category || product?.categoryName || '';
  const rule = await getActiveCommission(client, category, sellerModel || null);
  const percent = rule?.percent || 0;
  const fixed = rule?.fixedAmount || 0;
  const commissionAmount = (price * (percent / 100)) + fixed;
  return {
    commissionAmount: parseFloat(commissionAmount.toFixed(2)),
    commissionRate: percent,
    fixedAmount: fixed,
    appliedRuleId: rule?.id || null
  };
}

// ─── Full Managed shipping helpers ───────────────────────────────────────────

function getDeliveryZone(sector) {
  return SECTOR_ZONE_MAP[sector] || 'C';
}

function volumetricWeightKg(l, w, h) {
  if (!l || !w || !h) return 0;
  return (l * w * h) / 5000;
}

async function lookupWeightZoneRate(client, zone, billedWeightKg) {
  if (!billedWeightKg || billedWeightKg <= 0) return 0;

  // Cache key — round to 0.1 kg so we don't fan out cache rows continuously.
  const roundedKg = Math.round(billedWeightKg * 10) / 10;
  const cacheKey = `${zone}::${roundedKg}`;
  const cached = cacheGet(weightRateCache, cacheKey);
  if (cached !== undefined) return cached;

  const rate = await client.weightShippingRate.findFirst({
    where: {
      zone,
      minWeightKg: { lte: billedWeightKg },
      OR: [{ maxWeightKg: null }, { maxWeightKg: { gte: billedWeightKg } }]
    },
    orderBy: { minWeightKg: 'desc' }
  });
  const cost = rate?.cost ?? 0;
  cacheSet(weightRateCache, cacheKey, cost, WEIGHT_RATE_TTL_MS);
  return cost;
}

async function calculateFullManagedShipping(client, items, address) {
  const zone = getDeliveryZone(address?.sector);
  let totalActualKg = 0;
  let totalVolKg = 0;
  let chinaActualKg = 0;
  let chinaVolKg = 0;

  for (const item of items) {
    const qty = item.quantity || 1;
    const actual = (item.weightKg || 0) * qty;
    const vol = volumetricWeightKg(item.lengthCm, item.widthCm, item.heightCm) * qty;
    totalActualKg += actual;
    totalVolKg += vol;
    if (item.importOrigin === 'CHINA') {
      chinaActualKg += actual;
      chinaVolKg += vol;
    }
  }

  const localBilled = Math.max(totalActualKg, totalVolKg);
  const chinaBilled = Math.max(chinaActualKg, chinaVolKg);

  const [localCost, chinaCost] = await Promise.all([
    lookupWeightZoneRate(client, zone, localBilled),
    chinaBilled > 0 ? lookupWeightZoneRate(client, 'CHINA_RWANDA', chinaBilled) : Promise.resolve(0)
  ]);

  return {
    cost: parseFloat((localCost + chinaCost).toFixed(2)),
    zone,
    localBilled,
    chinaBilled,
    localCost,
    chinaCost,
    ruleId: null,
    shippingQuoted: true,
  };
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function calculateShippingForStore(prismaClient, storeId, address) {
  return calculateOrderShippingForStore(prismaClient, storeId, address, []);
}

export async function calculateOrderShippingForStore(prismaClient, storeId, address, storeItems = []) {
  const client = prismaClient || prismaDefault;
  const addr = address || {};

  const store = await client.store.findUnique({
    where: { id: storeId },
    select: { latitude: true, longitude: true, sellerModel: true }
  });

  // Full Managed: zone × weight tariff (shipping auto-calculated and confirmed)
  if (store?.sellerModel === 'FULL_MANAGED') {
    return calculateFullManagedShipping(client, storeItems, addr);
  }

  // Local Seller: seller quotes shipping fee after seeing the customer's address.
  // Shipping starts at 0 (unquoted); seller sets the actual fee from their orders page.
  return { cost: 0, ruleId: null, shippingQuoted: false };
}

export default {
  calculateItemCommission,
  calculateShippingForStore,
  calculateOrderShippingForStore
};
