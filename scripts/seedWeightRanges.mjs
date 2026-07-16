/**
 * Seed the DeliveryWeightRange table used by the shipping-fee formula. The
 * greater of a package's actual vs volumetric weight is matched to a range, and
 * that range's `chargeableKg` is plugged into the fee. The top row leaves
 * maxWeightKg null (open tier) so heavy packages still resolve. A weight below
 * the smallest min or (without an open tier) above the top is flagged for manual
 * review.
 *
 * Run: node scripts/seedWeightRanges.mjs
 * Edit at any time via admin → /admin/shipping → "Chargeable Weight Ranges".
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// [minWeightKg, maxWeightKg|null, chargeableKg]
const RANGES = [
  [0, 1, 1],
  [1, 3, 3],
  [3, 5, 5],
  [5, 10, 10],
  [10, 20, 20],
  [20, 50, 50],
  [50, null, 100], // open top tier
];

async function main() {
  const deleted = await prisma.deliveryWeightRange.deleteMany({});
  console.log(`Deleted ${deleted.count} existing weight ranges`);

  await prisma.deliveryWeightRange.createMany({
    data: RANGES.map(([minWeightKg, maxWeightKg, chargeableKg]) => ({ minWeightKg, maxWeightKg, chargeableKg })),
  });
  console.log(`Created ${RANGES.length} weight ranges`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
