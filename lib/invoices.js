// Invoice records — sequential numbering, immutable render snapshots, and the
// order → invoice wiring used by checkout (auto-issue on Bank Transfer), the
// customer download route, and the admin invoices dashboard.
import prisma from './prisma.js';
import { randomBytes } from 'crypto';

// INV-2026-00042 — the number the customer must quote on the transfer.
export function formatInvoiceNumber(n, issuedAt = new Date()) {
    return `INV-${issuedAt.getFullYear()}-${String(n).padStart(5, '0')}`;
}

// Human label for the shipping tier stored on the invoice.
export function shippingTierLabel(deliveryType) {
    if (deliveryType === 'KIGALI_POOL') return 'Kigali Pooled Delivery';
    if (deliveryType === 'EXPRESS') return 'Express Delivery';
    return 'Standard Delivery';
}

/**
 * Issue the invoice for an order — race-safe via the Postgres sequence
 * (nextval is a single statement; no transaction needed, PgBouncer-safe).
 * Idempotent per order thanks to the unique orderId index: a duplicate call
 * returns the existing invoice instead of issuing a second number.
 *
 * @param {object} args
 * @param {string} args.orderId
 * @param {number} args.subtotal   items subtotal before coupon
 * @param {number} args.shippingFee
 * @param {number} args.discount   coupon discount amount (RWF)
 * @param {number} args.total      grand total due
 * @param {number|null} args.chargeableKg
 * @param {string} args.shippingTier
 * @param {object} args.snapshot   everything the PDF needs (items, bank, customer, address, paymentMethod, coupon)
 * @returns {Promise<object>} the Invoice row
 */
export async function createInvoiceForOrder({ orderId, subtotal, shippingFee, discount, total, chargeableKg, shippingTier, snapshot }) {
    const existing = await prisma.invoice.findUnique({ where: { orderId } });
    if (existing) return existing;

    const id = 'inv_' + randomBytes(8).toString('hex');
    const year = new Date().getFullYear();
    const snapshotJson = JSON.stringify(snapshot || {});

    try {
        // Draw the number and format the reference in ONE statement so two
        // concurrent checkouts can never race between nextval and the insert.
        const rows = await prisma.$queryRaw`
            INSERT INTO "Invoice" (
                id, "invoiceNumber", "paymentReference", "orderId",
                subtotal, "shippingFee", discount, total,
                "chargeableKg", "shippingTier", snapshot
            )
            SELECT
                ${id}, seq.n,
                'INV-' || ${year}::text || '-' || LPAD(seq.n::text, 5, '0'),
                ${orderId},
                ${round2(subtotal)}, ${round2(shippingFee)}, ${round2(discount)}, ${round2(total)},
                ${chargeableKg == null ? null : round2(chargeableKg)}, ${shippingTier || null}, ${snapshotJson}::jsonb
            FROM (SELECT nextval('invoice_number_seq')::int AS n) seq
            RETURNING *
        `;
        return rows[0];
    } catch (err) {
        // Unique orderId violation → another request just issued it; reuse theirs.
        const dup = await prisma.invoice.findUnique({ where: { orderId } });
        if (dup) return dup;
        throw err;
    }
}

/**
 * Rebuild the order-shaped object the InvoiceDocument PDF renders from an
 * invoice's frozen snapshot, so the document never drifts after issue.
 */
export function orderViewFromInvoice(invoice) {
    const snap = invoice.snapshot && typeof invoice.snapshot === 'object' ? invoice.snapshot : {};
    return {
        id: invoice.orderId,
        paymentMethod: snap.paymentMethod || 'BANK_TRANSFER',
        createdAt: invoice.issuedAt,
        total: invoice.total,
        shippingCost: invoice.shippingFee,
        coupon: snap.coupon || {},
        user: { name: snap.customer?.name || '' },
        address: snap.address || {},
        orderItems: (snap.items || []).map((i) => ({
            price: i.price,
            quantity: i.quantity,
            product: { name: i.name },
        })),
    };
}

/** Payment config frozen in the snapshot (bank + momo details at issue time). */
export function paymentConfigFromInvoice(invoice) {
    const snap = invoice.snapshot && typeof invoice.snapshot === 'object' ? invoice.snapshot : {};
    return { ...(snap.bank || {}), ...(snap.momo || {}) };
}

function round2(n) {
    return parseFloat(Number(n || 0).toFixed(2));
}
