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
    'Fashion and Lifestyle',
    'Electronics',
    'Industrial Manufacturing',
    'Construction Supplies',
    'Home & Kitchen',
    'Office Supplies',
    'Health and Safety',
    'Automotive and Transportation',
    'Recreation'
];
