// Currency symbol
export const currencySymbol = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'Rwf';


// Payment method enum values (match prisma/schema.prisma PaymentMethod)
export const paymentMethod = {
    COD: 'COD',
    STRIPE: 'STRIPE'
};

// Shipping fee in currency units (e.g. 0 for free in Kigali)
export const shippingFee = 0;

// Product categories (used for add-product, shop filter, and category marquee)
export const productCategories = [
    'Agriculture & Food',
    'Apparel & Accessories',
    'Arts & Crafts',
    'Auto, Motorcycle Parts & Accessories',
    'Bags, Cases & Boxes',
    'Chemicals',
    'Computer Products',
    'Construction & Decoration',
    'Consumer Electronics',
    'Electrical & Electronics',
    'Furniture',
    'Health & Medicine',
    'Industrial Equipment & Components',
    'Instruments & Meters',
    'Light Industry & Daily Use',
    'Lights & Lighting',
    'Manufacturing & Processing Machinery',
    'Metallurgy, Mineral & Energy',
    'Office Supplies',
    'Packaging & Printing',
    'Security & Protection',
    'Service',
    'Sporting Goods & Recreation',
    'Textile',
    'Tools & Hardware',
    'Toys',
    'Transportation'
];
