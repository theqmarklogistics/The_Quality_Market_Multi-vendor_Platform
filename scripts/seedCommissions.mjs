// Seed default commission rates from the Quality Market business document.
// Run: node scripts/seedCommissions.mjs
// Safe to run multiple times (upsert by category+sellerModel pair).

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const FULL_MANAGED = "FULL_MANAGED";
const LOCAL_SELLER = "LOCAL_SELLER";

// Rates from the Full Managed model
const fullManagedRates = [
  { category: "Baby Products", percent: 5 },
  { category: "Backpacks, Handbags, and Luggage", percent: 5 },
  { category: "Beauty, Health, and Personal Care", percent: 5 },
  { category: "Business, Industrial, and Scientific Supplies", percent: 4 },
  { category: "Clothing and Accessories", percent: 7 },
  { category: "Compact Appliances", percent: 5 },
  { category: "Computers", percent: 5 },
  { category: "Consumer Electronics", percent: 5 },
  { category: "Electronics Accessories", percent: 5 },
  { category: "Eyewear", percent: 5 },
  { category: "Fine Art", percent: 10 },
  { category: "Footwear", percent: 5 },
  { category: "Full-Size Appliances", percent: 5 },
  { category: "Furniture", percent: 5 },
  { category: "Gift Cards", percent: 10 },
  { category: "Grocery and Gourmet", percent: 5 },
  { category: "Home and Kitchen", percent: 15 },
  { category: "Jewelry", percent: 10 },
  { category: "Lawn and Garden", percent: 5 },
  { category: "Lawn Mowers and Snow Throwers", percent: 15 },
  { category: "Mattresses", percent: 5 },
  { category: "Musical Instruments and AV Production", percent: 5 },
  { category: "Office Products", percent: 5 },
  { category: "Pet Products", percent: 10 },
  { category: "Sports and Outdoors", percent: 5 },
  { category: "Tires", percent: 5 },
  { category: "Tools and Home Improvement", percent: 5 },
  { category: "Toys and Games", percent: 5 },
  { category: "Vegetables", percent: 6 },
  { category: "Fruits", percent: 6 },
  { category: "Roots and Tubers", percent: 6 },
  { category: "Flour", percent: 6 },
  { category: "Soft Drink", percent: 5 },
  { category: "Alcoholic Beverages", percent: 5 },
  { category: "Milk and Milk Products", percent: 7 },
  { category: "Eggs", percent: 7 },
  { category: "Meats and Meat Products", percent: 8 },
];

// Rates from the Local Seller (Semi-Managed) model
const localSellerRates = [
  { category: "Baby Products", percent: 15 },
  { category: "Backpacks, Handbags, and Luggage", percent: 15 },
  { category: "Base Equipment Power Tools", percent: 15 },
  { category: "Beauty, Health, and Personal Care", percent: 15 },
  { category: "Business, Industrial, and Scientific Supplies", percent: 14 },
  { category: "Clothing and Accessories", percent: 17 },
  { category: "Compact Appliances", percent: 15 },
  { category: "Computers", percent: 15 },
  { category: "Consumer Electronics", percent: 15 },
  { category: "Electronics Accessories", percent: 15 },
  { category: "Everything Else", percent: 15 },
  { category: "Eyewear", percent: 15 },
  { category: "Fine Art", percent: 20 },
  { category: "Footwear", percent: 15 },
  { category: "Full-Size Appliances", percent: 15 },
  { category: "Furniture", percent: 15 },
  { category: "Gift Cards", percent: 20 },
  { category: "Grocery and Gourmet", percent: 15 },
  { category: "Home and Kitchen", percent: 15 },
  { category: "Jewelry", percent: 20 },
  { category: "Lawn and Garden", percent: 15 },
  { category: "Mattresses", percent: 15 },
  { category: "Musical Instruments and AV Production", percent: 15 },
  { category: "Office Products", percent: 15 },
  { category: "Pet Products", percent: 20 },
  { category: "Sports and Outdoors", percent: 15 },
  { category: "Tires", percent: 15 },
  { category: "Tools and Home Improvement", percent: 15 },
  { category: "Toys and Games", percent: 15 },
  { category: "Vegetables", percent: 16 },
  { category: "Fruits", percent: 16 },
  { category: "Roots and Tubers", percent: 16 },
  { category: "Flour", percent: 16 },
  { category: "Soft Drink", percent: 15 },
  { category: "Alcoholic Beverages", percent: 15 },
  { category: "Milk and Milk Products", percent: 17 },
  { category: "Eggs", percent: 17 },
  { category: "Meats and Meat Products", percent: 18 },
];

async function seed() {
  console.log("Seeding commission rates...");
  let created = 0;
  let updated = 0;

  const allRules = [
    ...fullManagedRates.map(r => ({ ...r, sellerModel: FULL_MANAGED })),
    ...localSellerRates.map(r => ({ ...r, sellerModel: LOCAL_SELLER })),
  ];

  for (const rule of allRules) {
    const existing = await prisma.categoryCommission.findFirst({
      where: { category: rule.category, sellerModel: rule.sellerModel }
    });

    if (existing) {
      await prisma.categoryCommission.update({
        where: { id: existing.id },
        data: { percent: rule.percent, fixedAmount: null }
      });
      updated++;
    } else {
      await prisma.categoryCommission.create({
        data: {
          category: rule.category,
          sellerModel: rule.sellerModel,
          percent: rule.percent,
          fixedAmount: null
        }
      });
      created++;
    }
  }

  console.log(`Done. Created: ${created}, Updated: ${updated}, Total: ${allRules.length}`);
  await prisma.$disconnect();
}

seed().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});