// Currency symbol
export const currencySymbol = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'Rwf';


// Payment method enum values (match prisma/schema.prisma PaymentMethod)
export const paymentMethod = {
    BANK_TRANSFER: 'BANK_TRANSFER',
    STRIPE: 'STRIPE',
    MTN_MOMO: 'MTN_MOMO',
    AIRTEL_MONEY: 'AIRTEL_MONEY'
};

// Shipping fee in currency units (e.g. 0 for free in Kigali)
export const shippingFee = 0;

// Category tree: consumer product categories with default referral fee rates per seller model
// Subcategories are empty — this is a flat list matching the business document
export const categoryTree = [
    { name: 'Baby Products', subcategories: [] },
    { name: 'Backpacks, Handbags, and Luggage', subcategories: [] },
    { name: 'Base Equipment Power Tools', subcategories: [] },
    { name: 'Beauty, Health, and Personal Care', subcategories: [] },
    { name: 'Business, Industrial, and Scientific Supplies', subcategories: [] },
    { name: 'Clothing and Accessories', subcategories: [] },
    { name: 'Compact Appliances', subcategories: [] },
    { name: 'Computers', subcategories: [] },
    { name: 'Consumer Electronics', subcategories: [] },
    { name: 'Electronics Accessories', subcategories: [] },
    { name: 'Everything Else', subcategories: [] },
    { name: 'Eyewear', subcategories: [] },
    { name: 'Fine Art', subcategories: [] },
    { name: 'Footwear', subcategories: [] },
    { name: 'Full-Size Appliances', subcategories: [] },
    { name: 'Furniture', subcategories: [] },
    { name: 'Gift Cards', subcategories: [] },
    { name: 'Grocery and Gourmet', subcategories: [] },
    { name: 'Home and Kitchen', subcategories: [] },
    { name: 'Jewelry', subcategories: [] },
    { name: 'Lawn and Garden', subcategories: [] },
    { name: 'Lawn Mowers and Snow Throwers', subcategories: [] },
    { name: 'Mattresses', subcategories: [] },
    { name: 'Musical Instruments and AV Production', subcategories: [] },
    { name: 'Office Products', subcategories: [] },
    { name: 'Pet Products', subcategories: [] },
    { name: 'Sports and Outdoors', subcategories: [] },
    { name: 'Tires', subcategories: [] },
    { name: 'Tools and Home Improvement', subcategories: [] },
    { name: 'Toys and Games', subcategories: [] },
    { name: 'Vegetables', subcategories: [] },
    { name: 'Fruits', subcategories: [] },
    { name: 'Roots and Tubers', subcategories: [] },
    { name: 'Flour', subcategories: [] },
    { name: 'Soft Drink', subcategories: [] },
    { name: 'Alcoholic Beverages', subcategories: [] },
    { name: 'Milk and Milk Products', subcategories: [] },
    { name: 'Eggs', subcategories: [] },
    { name: 'Meats and Meat Products', subcategories: [] },
];

// Flat list of all categories and subcategories (used for add-product and filter value)
export const productCategories = categoryTree.flatMap(({ name, subcategories }) => [name, ...subcategories]);

// Main category names only, stable order for marquee (avoids hydration mismatch)
export const mainCategoryNames = categoryTree.map((c) => c.name);

// Kigali sector → delivery zone mapping
// Zone A: Central (0–4 km), Zone B: Intermediate (4–8 km), Zone C: Periphery (>8 km, default)
export const SECTOR_ZONE_MAP = {
  // Zone A — Central Kigali
  'Nyarugenge': 'A', 'Kiyovu': 'A', 'Muhima': 'A', 'Kimisagara': 'A',
  'Biryogo': 'A', 'Rwezamenyo': 'A', 'Nyakabanda': 'A', 'Gitega': 'A',
  'Kigali': 'A', 'Gikondo': 'A', 'Kicukiro': 'A',

  // Zone B — Intermediate Kigali
  'Nyamirambo': 'B', 'Mageregere': 'B', 'Kanyinya': 'B', 'Rwampara': 'B',
  'Kimicanga': 'B', 'Muyange': 'B', 'Kacyiru': 'B', 'Kimironko': 'B',
  'Remera': 'B', 'Gisozi': 'B', 'Nyarutarama': 'B', 'Rugando': 'B',
  'Kibagabaga': 'B', 'Kimihurura': 'B', 'Gatsata': 'B', 'Niboye': 'B',
  'Gatenga': 'B', 'Kanombe': 'B', 'Masaka': 'B', 'Kagarama': 'B',
};

// All Kigali sectors available in address form (Zone C sectors not in map still default to C)
export const KIGALI_SECTORS = [
  ...Object.keys(SECTOR_ZONE_MAP),
  // Zone C — Periphery
  'Bumbogo', 'Jabana', 'Jali', 'Kinyinya', 'Ndera', 'Nduba', 'Rusororo', 'Rutunga',
  'Gikomero', 'Gahanga', 'Nyarugunga', 'Karama', 'Batsinda', 'Busanza', 'Gako', 'Kamashashi',
].sort();
