// Currency symbol
export const currencySymbol = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'Rwf';


// Payment method enum values (match prisma/schema.prisma PaymentMethod)
export const paymentMethod = {
    COD: 'COD',
    STRIPE: 'STRIPE'
};

// Shipping fee in currency units (e.g. 0 for free in Kigali)
export const shippingFee = 0;
