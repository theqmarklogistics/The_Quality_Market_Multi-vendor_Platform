// Currency symbol
export const currencySymbol = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'Rwf';


// Payment method enum values (match prisma/schema.prisma PaymentMethod)
export const paymentMethod = {
    COD: 'COD',
    STRIPE: 'STRIPE'
};

// Shipping fee in currency units (e.g. 0 for free in Kigali)
export const shippingFee = 0;

// Category tree: main categories with subcategories (for hover menu in shop filter)
export const categoryTree = [
    { name: 'Agriculture & Food', subcategories: ['Vegetables & Fruits', 'Food & Beverage', 'Additives & Extracts'] },
    { name: 'Apparel & Accessories', subcategories: ['Ready to Wear', 'Footwear & Headwear', 'Work & Safety Apparel', 'Apparel Accessories'] },
    { name: 'Textile', subcategories: ['Fabric & filter', 'Home textile', 'Textile accessories'] },
    { name: 'Bags, Cases & Boxes', subcategories: ['Fashion Bags', 'Sports & casual bags', 'Specialized bags & cases'] },
    { name: 'Arts & Crafts', subcategories: ['Jewelry & Accessories', 'Crafts by Material', 'Gifts & Decoration'] },
    { name: 'Consumer Electronics', subcategories: ['Cellphone & Accessories', 'Digital Devices', 'Audio & Video', 'Household Appliances', 'Electrical & Electronics', 'Optical Fiber, Cable & Wire', 'Motors', 'Power Supply & Distribution', 'Telecom & Broadcasting', 'Electronic Components'] },
    { name: 'Computer Products', subcategories: ['Computers', 'Network Hardware & Parts', 'Computer Components'] },
    { name: 'Lights & Lighting', subcategories: ['LED Interior Lighting', 'LED Professional Lighting', 'LED Outdoor Lighting', 'Professional Lighting', 'Lighting Decoration'] },
    { name: 'Industrial Equipment & Components', subcategories: ['Pumps', 'Industrial Valves', 'Power & Generators', 'Fastener & Fittings', 'Purifier & Filter', 'Other Equipments & Parts'] },
    { name: 'Manufacturing & Processing Machinery', subcategories: ['Agriculture Machinery', 'Plastic & Woodworking Machinery', 'Machine Tools', 'Construction Machinery', 'Other Machinery & Parts'] },
    { name: 'Instruments & Meters', subcategories: ['Test & Analysis Instruments', 'Optical & Lab Instruments', 'Measuring Instruments'] },
    { name: 'Construction & Decoration', subcategories: ['Bathroom & Kitchen', 'Door & Window', 'Finished & Structural Materials', 'Tiles & Flooring'] },
    { name: 'Tools & Hardware', subcategories: ['Hand Tools', 'Power Tools', 'Hardware', 'Diamond tools'] },
    { name: 'Furniture', subcategories: ['Furniture by Use', 'Chairs & Tables', 'Cabinets & Beds'] },
    { name: 'Office Supplies', subcategories: ['Stationery', 'Office Consumables', 'Office Equipments'] },
    { name: 'Light Industry & Daily Use', subcategories: ['Kitchenware', 'Bedding', 'Household cleaning', 'Beauty and personal care', 'Household and Garden'] },
    { name: 'Packaging & Printing', subcategories: ['Printing Machinery & Materials', 'Packing & Packaging Machinery', 'Package & Conveyance', 'Pre & Post-Press Equipments'] },
    { name: 'Health & Medicine', subcategories: ['Massagers', 'Medical Equipments', 'Medical Supplies', 'Medical Implements'] },
    { name: 'Security & Protection', subcategories: ['Surveillance & Access Control', 'Roadway Safety', 'Alarm & Fire Fighting', 'Workplace Safety Supplies'] },
    { name: 'Transportation', subcategories: ['Cycles & Parts', 'Electric Vehicles', 'Specialized Vehicles', 'Elevators & Lifts', 'Cargo & Storage', 'Boats & Marine Parts'] },
    { name: 'Auto, Motorcycle Parts & Accessories', subcategories: ['Auto Parts & Accessories', 'Car Parts & Accessories', 'Motorcycle Parts & Accessories', 'Auto Repair & Decoration', 'Auto Engine & Parts'] },
    { name: 'Sporting Goods & Recreation', subcategories: ['Indoor Sports & Fitness', 'Outdoor Sports & Facilities', 'Recreation Supplies'] },
    { name: 'Toys', subcategories: ['Inflatable', 'Toys for Sports & Recreation', 'Toys of Material', 'Toys of Special Use'] },
    { name: 'Chemicals', subcategories: ['Rubber & Plastic', 'Paint & Pigment', 'Inorganic Chemicals', 'Metallurgy, Mineral & Energy', 'Solar & Renewable Energy', 'Nonmetallic Products', 'Metal & Products'] },
    { name: 'Service', subcategories: ['Shipment & Storage', 'Commercial Service', 'Other Services'] },
];

// Flat list of all categories and subcategories (used for add-product and filter value)
export const productCategories = categoryTree.flatMap(({ name, subcategories }) => [name, ...subcategories]);

// Main category names only, stable order for marquee (avoids hydration mismatch)
export const mainCategoryNames = categoryTree.map((c) => c.name);
