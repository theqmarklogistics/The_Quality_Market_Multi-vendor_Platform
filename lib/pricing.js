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

async function getActiveCommission(prismaClient, category, sellerModel) {
  const client = prismaClient || prismaDefault;
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
  if (sellerModel) {
    const specific = await client.categoryCommission.findFirst({
      where: { category, sellerModel, ...dateFilter },
      orderBy: { createdAt: 'desc' }
    });
    if (specific) return specific;
  }

  // Fall back to a rule with no sellerModel set (applies to all)
  return client.categoryCommission.findFirst({
    where: { category, sellerModel: null, ...dateFilter },
    orderBy: { createdAt: 'desc' }
  });
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
  const rate = await client.weightShippingRate.findFirst({
    where: {
      zone,
      minWeightKg: { lte: billedWeightKg },
      OR: [{ maxWeightKg: null }, { maxWeightKg: { gte: billedWeightKg } }]
    },
    orderBy: { minWeightKg: 'desc' }
  });
  return rate?.cost ?? 0;
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
    ruleId: null
  };
}

// ─── Local Seller shipping helpers ───────────────────────────────────────────

async function findRegionRule(client, district) {
  if (!district) return null;
  return client.shippingRule.findFirst({
    where: { type: 'REGION', regionKey: district },
    orderBy: { priority: 'desc' }
  });
}

async function findKmRule(client, distanceKm) {
  if (distanceKm == null) return null;
  return client.shippingRule.findFirst({
    where: {
      type: 'KM',
      AND: [
        { minKm: { lte: distanceKm } },
        { maxKm: { gte: distanceKm } }
      ]
    },
    orderBy: { priority: 'desc' }
  });
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

  // Full Managed: zone × weight tariff
  if (store?.sellerModel === 'FULL_MANAGED') {
    return calculateFullManagedShipping(client, storeItems, addr);
  }

  // Local Seller: existing REGION / KM / DEFAULT rules
  if (addr.district) {
    const regionRule = await findRegionRule(client, addr.district);
    if (regionRule) {
      if (regionRule.flatRate != null) return { cost: regionRule.flatRate, ruleId: regionRule.id };
    }
  }

  if (store?.latitude != null && store?.longitude != null && addr.latitude != null && addr.longitude != null) {
    const distanceKm = haversineDistance(store.latitude, store.longitude, addr.latitude, addr.longitude);
    const kmRule = await findKmRule(client, distanceKm);
    if (kmRule) {
      if (kmRule.flatRate != null) return { cost: kmRule.flatRate, ruleId: kmRule.id, distanceKm };
      if (kmRule.perKmRate != null) return { cost: parseFloat((kmRule.perKmRate * distanceKm).toFixed(2)), ruleId: kmRule.id, distanceKm };
    }
  }

  const defaultRule = await client.shippingRule.findFirst({ where: { type: 'DEFAULT' }, orderBy: { priority: 'desc' } });
  if (defaultRule) {
    return { cost: defaultRule.flatRate || 0, ruleId: defaultRule.id };
  }

  return { cost: 0, ruleId: null };
}

export default {
  calculateItemCommission,
  calculateShippingForStore,
  calculateOrderShippingForStore
};
