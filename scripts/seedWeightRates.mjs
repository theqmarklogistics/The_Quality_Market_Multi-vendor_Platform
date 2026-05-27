/**
 * Seed the WeightShippingRate table with the official zone × weight tariff.
 * Source: "NEW Definition of Key Pricing Factors" courier tariff document.
 *
 * Zones: A (Central Kigali — 6 sectors),
 *        B (Intermediate Kigali — 15 sectors),
 *        C (Periphery — all other sectors, default)
 *        CHINA_RWANDA records are left untouched.
 *
 * Run: node scripts/seedWeightRates.mjs
 * Update costs at any time via admin → /admin/shipping → "Full Managed Tariff" tab.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 14 weight brackets from the official PDF tariff
// [minWeightKg, maxWeightKg, zoneACost, zoneBCost, zoneCCost]  (costs in Rwf)
const TARIFF = [
  [0,      1,     1000,    2000,    3000   ],
  [1,      5,     1200,    2400,    3800   ],
  [5,      10,    1500,    3000,    4000   ],
  [10,     20,    2000,    4000,    5000   ],
  [20,     50,    2500,    5000,    6000   ],
  [50,     100,   4500,    7000,    9000   ],
  [100,    250,   7000,    10000,   13000  ],
  [250,    500,   10000,   13000,   15000  ],
  [500,    1000,  15000,   20000,   30000  ],
  [1000,   3000,  20000,   25000,   35000  ],
  [3000,   6000,  30000,   40000,   50000  ],
  [6000,   10000, 35000,   45000,   60000  ],
  [10000,  15000, 50000,   70000,   100000 ],
  [15000,  30000, 120000,  180000,  250000 ],
];

async function main() {
  // Remove all existing Zone A / B / C records so stale brackets don't interfere
  // with the new bracket boundaries during lookup (CHINA_RWANDA is preserved)
  const deleted = await prisma.weightShippingRate.deleteMany({
    where: { zone: { in: ['A', 'B', 'C'] } }
  });
  console.log(`Deleted ${deleted.count} stale zone A/B/C records`);

  let created = 0;
  for (const [min, max, costA, costB, costC] of TARIFF) {
    await prisma.weightShippingRate.createMany({
      data: [
        { zone: 'A', minWeightKg: min, maxWeightKg: max, cost: costA },
        { zone: 'B', minWeightKg: min, maxWeightKg: max, cost: costB },
        { zone: 'C', minWeightKg: min, maxWeightKg: max, cost: costC },
      ],
    });
    created += 3;
  }

  console.log(`Created ${created} new records (${TARIFF.length} brackets × 3 zones)`);
  console.log('CHINA_RWANDA records were not modified.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
