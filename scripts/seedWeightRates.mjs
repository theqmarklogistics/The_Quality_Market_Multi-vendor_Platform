/**
 * Seed the WeightShippingRate table with the zone x weight tariff.
 * Zones: A (Central Kigali, 0-4km), B (Intermediate, 4-8km), C (Periphery, >8km)
 *        CHINA_RWANDA (international freight, China → Rwanda)
 *
 * Note: Zone B 10-20 kg = 4,000 Rwf (PDF shows 40,000 — confirmed typo, corrected here).
 * Update costs via admin /admin/shipping → "Full Managed Tariff" tab after seeding.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 15 weight brackets × 4 zones = 60 records
// [minWeightKg, maxWeightKg, zoneACost, zoneBCost, zoneCCost, chinaRwandaCost]
const TARIFF = [
  [0,    1,    500,    800,    1200,   5000],
  [1,    2,    800,    1200,   1800,   8000],
  [2,    3,    1000,   1500,   2200,   10000],
  [3,    5,    1500,   2000,   3000,   15000],
  [5,    10,   2000,   2500,   4000,   22000],
  [10,   20,   2800,   4000,   6000,   35000],  // Zone B corrected from PDF typo 40000 → 4000
  [20,   30,   4000,   6000,   9000,   50000],
  [30,   40,   5500,   8000,   12000,  65000],
  [40,   50,   7000,   10000,  15000,  80000],
  [50,   60,   8500,   12000,  18000,  95000],
  [60,   70,   10000,  14000,  21000,  110000],
  [70,   80,   11500,  16000,  24000,  125000],
  [80,   90,   13000,  18000,  27000,  140000],
  [90,   100,  14500,  20000,  30000,  155000],
  [100,  null, 16000,  22000,  33000,  175000],  // 100+ kg
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const [min, max, costA, costB, costC, costCR] of TARIFF) {
    const rows = [
      { zone: 'A', cost: costA },
      { zone: 'B', cost: costB },
      { zone: 'C', cost: costC },
      { zone: 'CHINA_RWANDA', cost: costCR },
    ];

    for (const { zone, cost } of rows) {
      const existing = await prisma.weightShippingRate.findFirst({
        where: { zone, minWeightKg: min }
      });

      if (existing) {
        await prisma.weightShippingRate.update({ where: { id: existing.id }, data: { cost, maxWeightKg: max } });
        updated++;
      } else {
        await prisma.weightShippingRate.create({ data: { zone, minWeightKg: min, maxWeightKg: max, cost } });
        created++;
      }
    }
  }

  console.log(`Done — Created: ${created}, Updated: ${updated}`);
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect());