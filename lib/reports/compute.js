import prisma from "@/lib/prisma";
import { REPORTS } from "./catalog";

// ─────────────────────────────────────────────────────────────────────────────
// Report computation engine.
//
// Every report resolves to ONE standard shape so a single set of renderers
// (dashboard UI, CSV, PDF) can present any of them:
//
//   {
//     type, title, area, scopeLabel, currency,
//     range: { from, to, label },
//     generatedAt,
//     kpis:     [{ label, value, format }],                 // headline numbers
//     sections: [
//       { id, title, kind: 'timeseries', valueFormat, data: [{ x, y }] },
//       { id, title, kind: 'table', columns: [{ key, label, format, align }], rows: [], note? },
//     ],
//   }
//
// `format` is one of: 'currency' | 'number' | 'percent' | 'text' | 'date'.
//
// Data access follows the codebase convention: fetch scalar rows, then hydrate
// related rows with a second `findMany({ where: { id: { in } } })` + Map — we
// avoid Prisma `include` for relation loading. Nested relation filters in
// `where` (e.g. `{ order: { storeId } }`) are used, matching existing routes.
// ─────────────────────────────────────────────────────────────────────────────

const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF';

// Sum the per-item platform commission stored as JSON on an order.
function commissionItems(order) {
    return Array.isArray(order.commission) ? order.commission : [];
}
function sumCommission(order) {
    return commissionItems(order).reduce((s, i) => s + (Number(i?.commissionAmount) || 0), 0);
}

// Coupon discount amount applied to an order (coupon.discount is a %). `total`
// is already net of the discount, so we back it out from the discounted
// merchandise total: merch = subtotal*(1 - p/100), so discount = merch*p/(100 - p).
function couponDiscountAmount(order) {
    const c = order.coupon && typeof order.coupon === 'object' ? order.coupon : null;
    const p = Number(c?.discount);
    if (!c || !p || p <= 0) return 0;
    const merch = Math.max(0, Number(order.total || 0) - Number(order.shippingCost || 0));
    if (p >= 100) return merch;
    return (merch * p) / (100 - p);
}

// Bucket rows into a daily time-series. When valueKey is null the bucket value
// is a count; otherwise it sums the numeric field. Only days with data appear.
function bucketByDay(rows, dateKey, valueKey) {
    const map = new Map();
    for (const r of rows) {
        const d = new Date(r[dateKey]);
        if (Number.isNaN(d.getTime())) continue;
        const key = d.toISOString().slice(0, 10);
        const add = valueKey ? Number(r[valueKey] || 0) : 1;
        map.set(key, (map.get(key) || 0) + add);
    }
    return [...map.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([x, y]) => ({ x, y: Math.round(y) }));
}

// Group rows by a key, folding each group with `seed`/`fold`.
function groupBy(rows, keyFn, seed, fold) {
    const map = new Map();
    for (const r of rows) {
        const k = keyFn(r);
        if (k == null) continue;
        map.set(k, fold(map.has(k) ? map.get(k) : seed(), r));
    }
    return map;
}

const round = (n) => Math.round(Number(n) || 0);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : 0);
const share = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : 0);

function rangeLabel(from, to) {
    const opt = { year: 'numeric', month: 'short', day: 'numeric' };
    return `${from.toLocaleDateString('en-RW', opt)} – ${to.toLocaleDateString('en-RW', opt)}`;
}

// Merge the per-report payload with the shared meta envelope.
function finalize(type, scope, from, to, payload) {
    const def = REPORTS[type];
    return {
        type,
        title: def?.title || type,
        area: def?.area || '',
        scopeLabel: scope.scopeLabel,
        currency: CURRENCY,
        range: { from: from.toISOString(), to: to.toISOString(), label: rangeLabel(from, to) },
        generatedAt: new Date().toISOString(),
        kpis: payload.kpis || [],
        sections: payload.sections || [],
    };
}

// Orders touched by this scope within the window. Sellers are hard-filtered to
// their own storeId; platform roles see everything.
function orderRangeWhere(scope, from, to) {
    return {
        createdAt: { gte: from, lte: to },
        ...(scope.storeId ? { storeId: scope.storeId } : {}),
    };
}

// ── Hydration helpers ────────────────────────────────────────────────────────
async function usersById(ids) {
    const list = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
    return new Map(list.map((u) => [u.id, u]));
}
async function productCategoriesById(ids) {
    const list = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, category: true } }) : [];
    return new Map(list.map((p) => [p.id, p]));
}

// ── Sales & Revenue ──────────────────────────────────────────────────────────
async function salesReport(scope, from, to) {
    const orders = await prisma.order.findMany({
        where: orderRangeWhere(scope, from, to),
        select: {
            id: true, total: true, createdAt: true, status: true, userId: true,
            paymentStatus: true, isCouponUsed: true, coupon: true, shippingCost: true, deliveryType: true,
        },
    });

    const paid = orders.filter((o) => o.paymentStatus === 'PAID');
    const pending = orders.filter((o) => o.paymentStatus === 'PENDING');
    const revenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);
    const shippingCollected = paid.reduce((s, o) => s + Number(o.shippingCost || 0), 0);
    const discountsGiven = orders.filter((o) => o.isCouponUsed).reduce((s, o) => s + couponDiscountAmount(o), 0);
    const aov = paid.length ? revenue / paid.length : 0;
    const uniqueCustomers = new Set(paid.map((o) => o.userId)).size;

    // Line items of the paid orders → items sold, top products, category mix.
    const paidIds = paid.map((o) => o.id);
    const items = paidIds.length
        ? await prisma.orderItem.findMany({ where: { orderId: { in: paidIds } }, select: { productId: true, quantity: true, price: true } })
        : [];
    const productIds = [...new Set(items.map((i) => i.productId))];
    const pmap = await productCategoriesById(productIds);
    const itemsSold = items.reduce((s, i) => s + (i.quantity || 0), 0);

    const byProduct = groupBy(
        items, (i) => i.productId,
        () => ({ qty: 0, revenue: 0 }),
        (acc, i) => ({ qty: acc.qty + (i.quantity || 0), revenue: acc.revenue + i.price * i.quantity })
    );
    const topProducts = [...byProduct.entries()]
        .map(([id, v]) => ({ name: pmap.get(id)?.name || 'Unknown product', category: pmap.get(id)?.category || '—', qty: v.qty, revenue: round(v.revenue), share: share(v.revenue, revenue) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);

    const byCategory = groupBy(
        items, (i) => pmap.get(i.productId)?.category || 'Uncategorised',
        () => ({ qty: 0, revenue: 0 }),
        (acc, i) => ({ qty: acc.qty + (i.quantity || 0), revenue: acc.revenue + i.price * i.quantity })
    );
    const categoryRows = [...byCategory.entries()]
        .map(([category, v]) => ({ category, qty: v.qty, revenue: round(v.revenue), share: share(v.revenue, revenue) }))
        .sort((a, b) => b.revenue - a.revenue);

    // Top customers by paid spend.
    const byCustomer = groupBy(paid, (o) => o.userId, () => ({ orders: 0, revenue: 0 }), (acc, o) => ({ orders: acc.orders + 1, revenue: acc.revenue + Number(o.total || 0) }));
    const customerIds = [...byCustomer.keys()];
    const umap = await usersById(customerIds);
    const topCustomers = [...byCustomer.entries()]
        .map(([id, v]) => ({ customer: umap.get(id)?.name || 'Customer', email: umap.get(id)?.email || '—', orders: v.orders, revenue: round(v.revenue) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);

    // Delivery-type revenue split.
    const byDeliveryType = groupBy(paid, (o) => o.deliveryType || 'STANDARD_UNPOOLED', () => ({ orders: 0, revenue: 0 }), (acc, o) => ({ orders: acc.orders + 1, revenue: acc.revenue + Number(o.total || 0) }));
    const deliveryTypeRows = [...byDeliveryType.entries()].map(([type, v]) => ({ type: prettyDeliveryType(type), orders: v.orders, revenue: round(v.revenue) }));

    // Order status distribution.
    const statusRows = [...groupBy(orders, (o) => o.status, () => 0, (a) => a + 1).entries()].map(([status, count]) => ({ status, count }));

    // Coupon usage.
    const couponRows = [...groupBy(
        orders.filter((o) => o.isCouponUsed && o.coupon && typeof o.coupon === 'object' && o.coupon.code),
        (o) => o.coupon.code, () => ({ uses: 0, discount: 0 }),
        (acc, o) => ({ uses: acc.uses + 1, discount: o.coupon.discount || acc.discount })
    ).entries()].map(([code, v]) => ({ code, uses: v.uses, discount: v.discount })).sort((a, b) => b.uses - a.uses);

    return finalize('sales', scope, from, to, {
        kpis: [
            { label: 'Revenue (paid)', value: round(revenue), format: 'currency' },
            { label: 'Paid orders', value: paid.length, format: 'number' },
            { label: 'Total orders', value: orders.length, format: 'number' },
            { label: 'Pending orders', value: pending.length, format: 'number' },
            { label: 'Paid conversion', value: pct(paid.length, orders.length), format: 'percent' },
            { label: 'Avg order value', value: round(aov), format: 'currency' },
            { label: 'Items sold', value: itemsSold, format: 'number' },
            { label: 'Unique customers', value: uniqueCustomers, format: 'number' },
            { label: 'Shipping collected', value: round(shippingCollected), format: 'currency' },
            { label: 'Discounts given', value: round(discountsGiven), format: 'currency' },
        ],
        sections: [
            { id: 'revenue-trend', title: 'Revenue per day', kind: 'timeseries', valueFormat: 'currency', data: bucketByDay(paid, 'createdAt', 'total') },
            { id: 'orders-trend', title: 'Orders per day', kind: 'timeseries', valueFormat: 'number', data: bucketByDay(orders, 'createdAt', null) },
            {
                id: 'top-products', title: 'Top products by revenue', kind: 'table',
                columns: [
                    { key: 'name', label: 'Product', format: 'text' },
                    { key: 'category', label: 'Category', format: 'text' },
                    { key: 'qty', label: 'Qty sold', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                    { key: 'share', label: '% of revenue', format: 'percent', align: 'right' },
                ],
                rows: topProducts,
            },
            {
                id: 'by-category', title: 'Sales by category', kind: 'table',
                columns: [
                    { key: 'category', label: 'Category', format: 'text' },
                    { key: 'qty', label: 'Qty sold', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                    { key: 'share', label: '% of revenue', format: 'percent', align: 'right' },
                ],
                rows: categoryRows,
            },
            {
                id: 'top-customers', title: 'Top customers', kind: 'table',
                columns: [
                    { key: 'customer', label: 'Customer', format: 'text' },
                    { key: 'email', label: 'Email', format: 'text' },
                    { key: 'orders', label: 'Orders', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Spend', format: 'currency', align: 'right' },
                ],
                rows: topCustomers,
            },
            {
                id: 'by-delivery-type', title: 'Revenue by delivery type', kind: 'table',
                columns: [
                    { key: 'type', label: 'Delivery type', format: 'text' },
                    { key: 'orders', label: 'Orders', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                ],
                rows: deliveryTypeRows,
            },
            {
                id: 'order-status', title: 'Orders by status', kind: 'table',
                columns: [
                    { key: 'status', label: 'Status', format: 'text' },
                    { key: 'count', label: 'Orders', format: 'number', align: 'right' },
                ],
                rows: statusRows,
            },
            {
                id: 'coupons', title: 'Coupon usage', kind: 'table',
                columns: [
                    { key: 'code', label: 'Coupon', format: 'text' },
                    { key: 'uses', label: 'Times used', format: 'number', align: 'right' },
                    { key: 'discount', label: 'Discount %', format: 'percent', align: 'right' },
                ],
                rows: couponRows,
                note: couponRows.length ? undefined : 'No coupons were used in this period.',
            },
        ],
    });
}

// ── Payments ─────────────────────────────────────────────────────────────────
async function paymentsReport(scope, from, to) {
    const orders = await prisma.order.findMany({
        where: orderRangeWhere(scope, from, to),
        select: {
            total: true, createdAt: true, paymentMethod: true, paymentStatus: true,
            paymentProofStatus: true, escrowStatus: true, invoiceRequested: true, invoiceStatus: true,
        },
    });

    const paid = orders.filter((o) => o.paymentStatus === 'PAID');
    const collected = paid.reduce((s, o) => s + Number(o.total || 0), 0);
    const pending = orders.filter((o) => o.paymentStatus === 'PENDING').reduce((s, o) => s + Number(o.total || 0), 0);
    const failed = orders.filter((o) => ['FAILED', 'EXPIRED', 'CANCELLED'].includes(o.paymentStatus)).length;
    const proofsAwaiting = orders.filter((o) => o.paymentProofStatus === 'SUBMITTED').length;
    const proofsApproved = orders.filter((o) => o.paymentProofStatus === 'APPROVED').length;
    const proofsRejected = orders.filter((o) => o.paymentProofStatus === 'REJECTED').length;
    const escrowHeld = orders.filter((o) => o.escrowStatus === 'HELD').reduce((s, o) => s + Number(o.total || 0), 0);
    const invoiceReq = orders.filter((o) => o.invoiceRequested).length;

    const methodRows = [...groupBy(paid, (o) => o.paymentMethod || 'UNKNOWN', () => ({ orders: 0, amount: 0 }), (acc, o) => ({ orders: acc.orders + 1, amount: acc.amount + Number(o.total || 0) })).entries()]
        .map(([method, v]) => ({ method: prettyMethod(method), orders: v.orders, amount: round(v.amount), share: share(v.amount, collected) }))
        .sort((a, b) => b.amount - a.amount);

    const statusRows = [...groupBy(orders, (o) => o.paymentStatus || 'UNKNOWN', () => ({ orders: 0, amount: 0 }), (acc, o) => ({ orders: acc.orders + 1, amount: acc.amount + Number(o.total || 0) })).entries()]
        .map(([status, v]) => ({ status, orders: v.orders, amount: round(v.amount) }))
        .sort((a, b) => b.orders - a.orders);

    const proofRows = [...groupBy(orders, (o) => o.paymentProofStatus || 'NOT_SUBMITTED', () => 0, (a) => a + 1).entries()].map(([status, count]) => ({ status, count }));
    const escrowRows = [...groupBy(orders, (o) => o.escrowStatus || 'NOT_HELD', () => ({ orders: 0, amount: 0 }), (acc, o) => ({ orders: acc.orders + 1, amount: acc.amount + Number(o.total || 0) })).entries()]
        .map(([status, v]) => ({ status, orders: v.orders, amount: round(v.amount) }));

    return finalize('payments', scope, from, to, {
        kpis: [
            { label: 'Collected (paid)', value: round(collected), format: 'currency' },
            { label: 'Pending collection', value: round(pending), format: 'currency' },
            { label: 'Paid orders', value: paid.length, format: 'number' },
            { label: 'Failed / expired', value: failed, format: 'number' },
            { label: 'Proofs to review', value: proofsAwaiting, format: 'number' },
            { label: 'Proofs approved', value: proofsApproved, format: 'number' },
            { label: 'Proofs rejected', value: proofsRejected, format: 'number' },
            { label: 'Escrow held', value: round(escrowHeld), format: 'currency' },
            { label: 'Invoice requests', value: invoiceReq, format: 'number' },
        ],
        sections: [
            { id: 'collections-trend', title: 'Collections per day', kind: 'timeseries', valueFormat: 'currency', data: bucketByDay(paid, 'createdAt', 'total') },
            {
                id: 'by-method', title: 'Collections by payment method', kind: 'table',
                columns: [
                    { key: 'method', label: 'Method', format: 'text' },
                    { key: 'orders', label: 'Paid orders', format: 'number', align: 'right' },
                    { key: 'amount', label: 'Amount', format: 'currency', align: 'right' },
                    { key: 'share', label: '% of collected', format: 'percent', align: 'right' },
                ],
                rows: methodRows,
            },
            {
                id: 'by-status', title: 'Orders by payment status', kind: 'table',
                columns: [
                    { key: 'status', label: 'Status', format: 'text' },
                    { key: 'orders', label: 'Orders', format: 'number', align: 'right' },
                    { key: 'amount', label: 'Amount', format: 'currency', align: 'right' },
                ],
                rows: statusRows,
            },
            {
                id: 'proofs', title: 'Payment proof pipeline', kind: 'table',
                columns: [
                    { key: 'status', label: 'Proof status', format: 'text' },
                    { key: 'count', label: 'Orders', format: 'number', align: 'right' },
                ],
                rows: proofRows,
            },
            {
                id: 'escrow', title: 'Escrow held', kind: 'table',
                columns: [
                    { key: 'status', label: 'Escrow status', format: 'text' },
                    { key: 'orders', label: 'Orders', format: 'number', align: 'right' },
                    { key: 'amount', label: 'Amount', format: 'currency', align: 'right' },
                ],
                rows: escrowRows,
            },
        ],
    });
}

function prettyMethod(m) {
    return ({ STRIPE: 'Card (Stripe)', MTN_MOMO: 'MTN MoMo', AIRTEL_MONEY: 'Airtel Money', BANK_TRANSFER: 'Bank transfer', EKASH: 'eKash' })[m] || m;
}

// ── Payouts & Commissions ────────────────────────────────────────────────────
async function payoutsReport(scope, from, to) {
    if (scope.storeId) return sellerPayoutsReport(scope, from, to);
    return platformPayoutsReport(scope, from, to);
}

// Build category → { gross, commission } from a set of orders + their line items.
async function earningsByCategory(orders) {
    const orderIds = orders.map((o) => o.id);
    const items = orderIds.length
        ? await prisma.orderItem.findMany({ where: { orderId: { in: orderIds } }, select: { productId: true, quantity: true, price: true } })
        : [];
    const commItems = orders.flatMap((o) => commissionItems(o));
    const ids = [...new Set([...items.map((i) => i.productId), ...commItems.map((c) => c.productId)].filter(Boolean))];
    const pmap = await productCategoriesById(ids);
    const catOf = (pid) => pmap.get(pid)?.category || 'Uncategorised';

    const map = new Map();
    const bump = (cat, g, c) => {
        const cur = map.get(cat) || { gross: 0, commission: 0 };
        cur.gross += g; cur.commission += c; map.set(cat, cur);
    };
    for (const i of items) bump(catOf(i.productId), i.price * i.quantity, 0);
    for (const c of commItems) bump(catOf(c.productId), 0, Number(c.commissionAmount || 0));
    return map;
}

// Seller view — their own earnings, commission and settlement history.
async function sellerPayoutsReport(scope, from, to) {
    const [allPaid, payouts, paidOutAgg] = await Promise.all([
        prisma.order.findMany({ where: { storeId: scope.storeId, paymentStatus: 'PAID' }, select: { id: true, total: true, commission: true, createdAt: true } }),
        prisma.payout.findMany({ where: { storeId: scope.storeId }, orderBy: { createdAt: 'desc' }, take: 200 }),
        prisma.payout.aggregate({ where: { storeId: scope.storeId, status: 'PAID' }, _sum: { amount: true } }),
    ]);

    const gross = allPaid.reduce((s, o) => s + Number(o.total || 0), 0);
    const commission = allPaid.reduce((s, o) => s + sumCommission(o), 0);
    const net = gross - commission;
    const paidOut = Number(paidOutAgg?._sum?.amount || 0);
    const unpaid = Math.max(0, net - paidOut);

    const inRange = allPaid.filter((o) => new Date(o.createdAt) >= from && new Date(o.createdAt) <= to);
    const grossRange = inRange.reduce((s, o) => s + Number(o.total || 0), 0);
    const commissionRange = inRange.reduce((s, o) => s + sumCommission(o), 0);

    const catMap = await earningsByCategory(inRange);
    const categoryRows = [...catMap.entries()]
        .map(([category, v]) => ({ category, gross: round(v.gross), commission: round(v.commission), net: round(v.gross - v.commission) }))
        .sort((a, b) => b.net - a.net);

    // Net earnings per day in range (gross − commission per order).
    const netSeries = bucketByDay(inRange.map((o) => ({ createdAt: o.createdAt, net: Number(o.total || 0) - sumCommission(o) })), 'createdAt', 'net');

    const payoutRows = payouts.map((p) => ({
        createdAt: p.createdAt,
        period: `${new Date(p.periodStart).toLocaleDateString('en-RW')} – ${new Date(p.periodEnd).toLocaleDateString('en-RW')}`,
        amount: round(p.amount), status: p.status, notes: p.notes || '—',
    }));

    return finalize('payouts', scope, from, to, {
        kpis: [
            { label: 'Gross sales (all-time)', value: round(gross), format: 'currency' },
            { label: 'Commission (all-time)', value: round(commission), format: 'currency' },
            { label: 'Net earnings (all-time)', value: round(net), format: 'currency' },
            { label: 'Paid out', value: round(paidOut), format: 'currency' },
            { label: 'Unpaid balance', value: round(unpaid), format: 'currency' },
            { label: 'Gross sales (range)', value: round(grossRange), format: 'currency' },
            { label: 'Net earnings (range)', value: round(grossRange - commissionRange), format: 'currency' },
            { label: 'Paid orders (range)', value: inRange.length, format: 'number' },
        ],
        sections: [
            { id: 'net-trend', title: 'Net earnings per day', kind: 'timeseries', valueFormat: 'currency', data: netSeries },
            {
                id: 'by-category', title: 'Earnings by category (this period)', kind: 'table',
                columns: [
                    { key: 'category', label: 'Category', format: 'text' },
                    { key: 'gross', label: 'Gross', format: 'currency', align: 'right' },
                    { key: 'commission', label: 'Commission', format: 'currency', align: 'right' },
                    { key: 'net', label: 'Net', format: 'currency', align: 'right' },
                ],
                rows: categoryRows,
                note: categoryRows.length ? undefined : 'No sales in this period.',
            },
            {
                id: 'payout-history', title: 'Payout history', kind: 'table',
                columns: [
                    { key: 'createdAt', label: 'Created', format: 'date' },
                    { key: 'period', label: 'Period', format: 'text' },
                    { key: 'amount', label: 'Amount', format: 'currency', align: 'right' },
                    { key: 'status', label: 'Status', format: 'text' },
                    { key: 'notes', label: 'Notes', format: 'text' },
                ],
                rows: payoutRows,
                note: payoutRows.length ? undefined : 'No payouts have been issued to your store yet.',
            },
        ],
    });
}

// Admin / financial view — platform commission earned in range, plus an
// all-time settlement snapshot per store (mirrors app/api/admin/payouts).
async function platformPayoutsReport(scope, from, to) {
    const [rangeOrders, allPaidOrders, stores, paidPayoutsAgg, rangePayouts] = await Promise.all([
        prisma.order.findMany({ where: { paymentStatus: 'PAID', createdAt: { gte: from, lte: to } }, select: { id: true, storeId: true, commission: true, total: true, createdAt: true } }),
        prisma.order.findMany({ where: { paymentStatus: 'PAID', storeId: { not: null } }, select: { storeId: true, total: true, commission: true } }),
        prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
        prisma.payout.groupBy({ by: ['storeId'], where: { status: 'PAID' }, _sum: { amount: true } }),
        prisma.payout.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'desc' }, take: 200 }),
    ]);

    const commissionInRange = rangeOrders.reduce((s, o) => s + sumCommission(o), 0);
    const grossInRange = rangeOrders.reduce((s, o) => s + Number(o.total || 0), 0);

    const paidOutMap = new Map(paidPayoutsAgg.map((p) => [p.storeId, Number(p._sum.amount || 0)]));
    const storeMap = new Map(stores.map((s) => [s.id, s.name]));

    const netByStore = groupBy(
        allPaidOrders, (o) => o.storeId,
        () => ({ gross: 0, commission: 0, orders: 0 }),
        (acc, o) => ({ gross: acc.gross + Number(o.total || 0), commission: acc.commission + sumCommission(o), orders: acc.orders + 1 })
    );

    let totalNet = 0;
    let totalPaidOut = 0;
    const storeRows = [...netByStore.entries()]
        .map(([storeId, v]) => {
            const net = round(v.gross - v.commission);
            const paidOut = round(paidOutMap.get(storeId) || 0);
            totalNet += net; totalPaidOut += paidOut;
            return { store: storeMap.get(storeId) || 'Archived store', orders: v.orders, commission: round(v.commission), net, paidOut, unpaid: Math.max(0, net - paidOut) };
        })
        .filter((r) => r.net > 0)
        .sort((a, b) => b.unpaid - a.unpaid);
    for (const [storeId, amt] of paidOutMap.entries()) {
        if (!netByStore.has(storeId)) totalPaidOut += round(amt);
    }

    // Commission by category (this period).
    const catMap = await earningsByCategory(rangeOrders);
    const categoryRows = [...catMap.entries()]
        .map(([category, v]) => ({ category, gross: round(v.gross), commission: round(v.commission), rate: pct(v.commission, v.gross) }))
        .sort((a, b) => b.commission - a.commission);

    const payoutRows = rangePayouts.map((p) => ({ createdAt: p.createdAt, store: storeMap.get(p.storeId) || 'Store', amount: round(p.amount), status: p.status }));

    return finalize('payouts', scope, from, to, {
        kpis: [
            { label: 'Commission earned (range)', value: round(commissionInRange), format: 'currency' },
            { label: 'Gross sales (range)', value: round(grossInRange), format: 'currency' },
            { label: 'Effective commission', value: pct(commissionInRange, grossInRange), format: 'percent' },
            { label: 'Owed to sellers (all-time)', value: round(totalNet), format: 'currency' },
            { label: 'Paid out (all-time)', value: round(totalPaidOut), format: 'currency' },
            { label: 'Outstanding balance', value: round(Math.max(0, totalNet - totalPaidOut)), format: 'currency' },
            { label: 'Payouts issued (range)', value: rangePayouts.length, format: 'number' },
            { label: 'Payout value (range)', value: round(rangePayouts.reduce((s, p) => s + Number(p.amount || 0), 0)), format: 'currency' },
        ],
        sections: [
            { id: 'commission-trend', title: 'Commission earned per day', kind: 'timeseries', valueFormat: 'currency', data: bucketByDay(rangeOrders.map((o) => ({ createdAt: o.createdAt, comm: sumCommission(o) })), 'createdAt', 'comm') },
            {
                id: 'commission-by-category', title: 'Commission by category (this period)', kind: 'table',
                columns: [
                    { key: 'category', label: 'Category', format: 'text' },
                    { key: 'gross', label: 'Gross', format: 'currency', align: 'right' },
                    { key: 'commission', label: 'Commission', format: 'currency', align: 'right' },
                    { key: 'rate', label: 'Eff. rate', format: 'percent', align: 'right' },
                ],
                rows: categoryRows,
                note: categoryRows.length ? undefined : 'No commissionable sales in this period.',
            },
            {
                id: 'store-settlements', title: 'Seller settlement snapshot (all-time)', kind: 'table',
                columns: [
                    { key: 'store', label: 'Store', format: 'text' },
                    { key: 'orders', label: 'Paid orders', format: 'number', align: 'right' },
                    { key: 'commission', label: 'Commission', format: 'currency', align: 'right' },
                    { key: 'net', label: 'Net earnings', format: 'currency', align: 'right' },
                    { key: 'paidOut', label: 'Paid out', format: 'currency', align: 'right' },
                    { key: 'unpaid', label: 'Outstanding', format: 'currency', align: 'right' },
                ],
                rows: storeRows,
            },
            {
                id: 'payouts-in-range', title: 'Payouts issued in this period', kind: 'table',
                columns: [
                    { key: 'createdAt', label: 'Date', format: 'date' },
                    { key: 'store', label: 'Store', format: 'text' },
                    { key: 'amount', label: 'Amount', format: 'currency', align: 'right' },
                    { key: 'status', label: 'Status', format: 'text' },
                ],
                rows: payoutRows,
                note: payoutRows.length ? undefined : 'No payouts were issued in this period.',
            },
        ],
    });
}

// ── Deliveries & Logistics (admin + logistics manager) ───────────────────────
async function deliveriesReport(scope, from, to) {
    const orders = await prisma.order.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
            createdAt: true, deliveryType: true, deliveryStatus: true, status: true, intakeMethod: true,
            isExternalDelivery: true, paymentStatus: true, shippingCost: true, deliveryAttempts: true,
            deliveryDistanceKm: true, failureReason: true, escrowStatus: true,
        },
    });

    const delivered = orders.filter((o) => o.deliveryStatus === 'DELIVERED' || o.status === 'DELIVERED').length;
    const failed = orders.filter((o) => o.deliveryStatus === 'FAILED').length;
    const inTransit = orders.filter((o) => ['SORTING', 'IN_TRANSIT', 'ARRIVING'].includes(o.deliveryStatus) || o.status === 'SHIPPED').length;
    const pendingIntake = orders.filter((o) => o.deliveryStatus === 'PENDING_INTAKE').length;
    const external = orders.filter((o) => o.isExternalDelivery).length;
    const feesCollected = orders.filter((o) => o.paymentStatus === 'PAID').reduce((s, o) => s + Number(o.shippingCost || 0), 0);
    const attemptsVals = orders.filter((o) => o.deliveryAttempts != null).map((o) => o.deliveryAttempts);
    const avgAttempts = attemptsVals.length ? round2(attemptsVals.reduce((s, n) => s + n, 0) / attemptsVals.length) : 0;
    const distVals = orders.filter((o) => o.deliveryDistanceKm != null).map((o) => o.deliveryDistanceKm);
    const avgDistance = distVals.length ? round2(distVals.reduce((s, n) => s + n, 0) / distVals.length) : 0;

    const typeRows = [...groupBy(orders, (o) => o.deliveryType || 'STANDARD_UNPOOLED', () => 0, (a) => a + 1).entries()].map(([type, count]) => ({ type: prettyDeliveryType(type), count }));
    const poolStatusRows = [...groupBy(orders.filter((o) => o.deliveryStatus), (o) => o.deliveryStatus, () => 0, (a) => a + 1).entries()].map(([status, count]) => ({ status, count }));
    const intakeRows = [...groupBy(orders.filter((o) => o.intakeMethod), (o) => o.intakeMethod, () => 0, (a) => a + 1).entries()].map(([method, count]) => ({ method: method === 'HUB_DROP_OFF' ? 'Hub drop-off' : 'Driver sweep', count }));
    const failureRows = [...groupBy(orders.filter((o) => o.failureReason), (o) => o.failureReason, () => 0, (a) => a + 1).entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

    // Corridor runs + rider activity.
    const corridors = await prisma.deliveryCorridor.findMany({
        where: { runDate: { gte: from, lte: to } },
        select: { id: true, name: true, status: true, runDate: true, assignedRiderId: true },
        orderBy: { runDate: 'desc' }, take: 300,
    });
    const corridorIds = corridors.map((c) => c.id);
    const stopsAgg = corridorIds.length ? await prisma.order.groupBy({ by: ['corridorId'], where: { corridorId: { in: corridorIds } }, _count: { _all: true } }) : [];
    const stopsMap = new Map(stopsAgg.map((s) => [s.corridorId, s._count._all]));
    const riderIds = [...new Set(corridors.map((c) => c.assignedRiderId).filter(Boolean))];
    const riders = riderIds.length ? await prisma.user.findMany({ where: { id: { in: riderIds } }, select: { id: true, name: true } }) : [];
    const riderMap = new Map(riders.map((u) => [u.id, u.name]));

    const corridorRows = corridors.map((c) => ({ runDate: c.runDate, name: c.name, rider: c.assignedRiderId ? (riderMap.get(c.assignedRiderId) || 'Rider') : 'Unassigned', stops: stopsMap.get(c.id) || 0, status: c.status }));

    // Rider activity aggregation.
    const riderAgg = groupBy(
        corridors.filter((c) => c.assignedRiderId), (c) => c.assignedRiderId,
        () => ({ runs: 0, completed: 0, stops: 0 }),
        (acc, c) => ({ runs: acc.runs + 1, completed: acc.completed + (c.status === 'COMPLETED' ? 1 : 0), stops: acc.stops + (stopsMap.get(c.id) || 0) })
    );
    const riderRows = [...riderAgg.entries()].map(([id, v]) => ({ rider: riderMap.get(id) || 'Rider', runs: v.runs, completed: v.completed, stops: v.stops })).sort((a, b) => b.stops - a.stops);

    return finalize('deliveries', scope, from, to, {
        kpis: [
            { label: 'Shipments (range)', value: orders.length, format: 'number' },
            { label: 'Delivered', value: delivered, format: 'number' },
            { label: 'In transit', value: inTransit, format: 'number' },
            { label: 'Pending intake', value: pendingIntake, format: 'number' },
            { label: 'Failed', value: failed, format: 'number' },
            { label: 'Success rate', value: pct(delivered, delivered + failed), format: 'percent' },
            { label: 'External deliveries', value: external, format: 'number' },
            { label: 'Avg attempts', value: avgAttempts, format: 'number' },
            { label: 'Avg distance (km)', value: avgDistance, format: 'number' },
            { label: 'Delivery fees collected', value: round(feesCollected), format: 'currency' },
        ],
        sections: [
            { id: 'shipments-trend', title: 'Shipments per day', kind: 'timeseries', valueFormat: 'number', data: bucketByDay(orders, 'createdAt', null) },
            {
                id: 'by-type', title: 'Shipments by delivery type', kind: 'table',
                columns: [{ key: 'type', label: 'Delivery type', format: 'text' }, { key: 'count', label: 'Shipments', format: 'number', align: 'right' }],
                rows: typeRows,
            },
            {
                id: 'pool-status', title: 'Pooled delivery status breakdown', kind: 'table',
                columns: [{ key: 'status', label: 'Status', format: 'text' }, { key: 'count', label: 'Shipments', format: 'number', align: 'right' }],
                rows: poolStatusRows, note: poolStatusRows.length ? undefined : 'No pooled deliveries in this period.',
            },
            {
                id: 'intake', title: 'Intake method', kind: 'table',
                columns: [{ key: 'method', label: 'Intake method', format: 'text' }, { key: 'count', label: 'Shipments', format: 'number', align: 'right' }],
                rows: intakeRows, note: intakeRows.length ? undefined : 'No intake data in this period.',
            },
            {
                id: 'rider-activity', title: 'Rider activity', kind: 'table',
                columns: [
                    { key: 'rider', label: 'Rider', format: 'text' },
                    { key: 'runs', label: 'Corridor runs', format: 'number', align: 'right' },
                    { key: 'completed', label: 'Completed', format: 'number', align: 'right' },
                    { key: 'stops', label: 'Stops served', format: 'number', align: 'right' },
                ],
                rows: riderRows, note: riderRows.length ? undefined : 'No riders were assigned in this period.',
            },
            {
                id: 'failures', title: 'Failure reasons', kind: 'table',
                columns: [{ key: 'reason', label: 'Reason', format: 'text' }, { key: 'count', label: 'Shipments', format: 'number', align: 'right' }],
                rows: failureRows, note: failureRows.length ? undefined : 'No failed deliveries in this period.',
            },
            {
                id: 'corridors', title: 'Corridor runs', kind: 'table',
                columns: [
                    { key: 'runDate', label: 'Run date', format: 'date' },
                    { key: 'name', label: 'Corridor', format: 'text' },
                    { key: 'rider', label: 'Rider', format: 'text' },
                    { key: 'stops', label: 'Stops', format: 'number', align: 'right' },
                    { key: 'status', label: 'Status', format: 'text' },
                ],
                rows: corridorRows, note: corridorRows.length ? undefined : 'No corridor runs scheduled in this period.',
            },
        ],
    });
}

function prettyDeliveryType(t) {
    return ({ STANDARD_UNPOOLED: 'Standard', KIGALI_POOL: 'Kigali pooled', EXPRESS: 'Express' })[t] || t;
}

// ── Products & Inventory ─────────────────────────────────────────────────────
// Inventory KPIs are a live snapshot (not range-bound); best sellers use range.
async function catalogReport(scope, from, to) {
    const storeWhere = scope.storeId ? { storeId: scope.storeId } : {};

    // One scan of the (scoped) catalogue powers every inventory metric.
    const products = await prisma.product.findMany({
        where: storeWhere,
        select: { name: true, category: true, price: true, mrp: true, warehouseQuantity: true, inStock: true, approvalStatus: true, importOrigin: true },
    });

    const total = products.length;
    const inStock = products.filter((p) => p.inStock).length;
    const outOfStock = products.filter((p) => !p.inStock).length;
    const approved = products.filter((p) => p.approvalStatus === 'APPROVED').length;
    const pending = products.filter((p) => p.approvalStatus === 'PENDING').length;
    const rejected = products.filter((p) => p.approvalStatus === 'REJECTED').length;
    const lowStock = products.filter((p) => p.approvalStatus === 'APPROVED' && (p.warehouseQuantity ?? 0) <= 5).length;
    const invUnits = products.reduce((s, p) => s + (p.warehouseQuantity || 0), 0);
    const invValue = products.reduce((s, p) => s + (p.price || 0) * (p.warehouseQuantity || 0), 0);
    const avgPrice = total ? products.reduce((s, p) => s + (p.price || 0), 0) / total : 0;

    const categoryRows = [...groupBy(products, (p) => p.category || 'Uncategorised', () => ({ count: 0, units: 0, value: 0 }), (acc, p) => ({ count: acc.count + 1, units: acc.units + (p.warehouseQuantity || 0), value: acc.value + (p.price || 0) * (p.warehouseQuantity || 0) })).entries()]
        .map(([category, v]) => ({ category, count: v.count, units: v.units, value: round(v.value) }))
        .sort((a, b) => b.value - a.value);

    const approvalRows = [
        { status: 'Approved', count: approved },
        { status: 'Pending', count: pending },
        { status: 'Rejected', count: rejected },
    ];
    const originRows = [...groupBy(products, (p) => p.importOrigin || 'Local (Rwanda)', () => 0, (a) => a + 1).entries()].map(([origin, count]) => ({ origin, count }));

    const lowRows = products.filter((p) => p.approvalStatus === 'APPROVED' && (p.warehouseQuantity ?? 0) <= 5)
        .sort((a, b) => (a.warehouseQuantity || 0) - (b.warehouseQuantity || 0))
        .slice(0, 50)
        .map((p) => ({ name: p.name, category: p.category, qty: p.warehouseQuantity, state: p.inStock ? 'In stock' : 'Out of stock' }));
    const outRows = products.filter((p) => !p.inStock).slice(0, 50).map((p) => ({ name: p.name, category: p.category, qty: p.warehouseQuantity }));

    // Best sellers by quantity in the window (scoped to the seller's products).
    const paidOrders = await prisma.order.findMany({ where: { paymentStatus: 'PAID', createdAt: { gte: from, lte: to }, ...(scope.storeId ? { storeId: scope.storeId } : {}) }, select: { id: true } });
    const paidIds = paidOrders.map((o) => o.id);
    const items = paidIds.length ? await prisma.orderItem.findMany({ where: { orderId: { in: paidIds } }, select: { productId: true, quantity: true, price: true } }) : [];
    const soldIds = [...new Set(items.map((i) => i.productId))];
    const pmap = soldIds.length ? new Map((await prisma.product.findMany({ where: { id: { in: soldIds }, ...storeWhere }, select: { id: true, name: true } })).map((p) => [p.id, p.name])) : new Map();
    const bestByProduct = groupBy(items.filter((i) => pmap.has(i.productId)), (i) => i.productId, () => ({ qty: 0, revenue: 0 }), (acc, i) => ({ qty: acc.qty + (i.quantity || 0), revenue: acc.revenue + i.price * i.quantity }));
    const bestSellers = [...bestByProduct.entries()].map(([id, v]) => ({ name: pmap.get(id) || 'Product', qty: v.qty, revenue: round(v.revenue) })).sort((a, b) => b.qty - a.qty).slice(0, 15);

    return finalize('catalog', scope, from, to, {
        kpis: [
            { label: 'Total products', value: total, format: 'number' },
            { label: 'In stock', value: inStock, format: 'number' },
            { label: 'Out of stock', value: outOfStock, format: 'number' },
            { label: 'Low stock (≤5)', value: lowStock, format: 'number' },
            { label: 'Pending approval', value: pending, format: 'number' },
            { label: 'Rejected', value: rejected, format: 'number' },
            { label: 'Inventory units', value: invUnits, format: 'number' },
            { label: 'Inventory value', value: round(invValue), format: 'currency' },
            { label: 'Avg price', value: round(avgPrice), format: 'currency' },
        ],
        sections: [
            {
                id: 'best-sellers', title: 'Best sellers (this period)', kind: 'table',
                columns: [
                    { key: 'name', label: 'Product', format: 'text' },
                    { key: 'qty', label: 'Qty sold', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                ],
                rows: bestSellers, note: bestSellers.length ? undefined : 'No units sold in this period.',
            },
            {
                id: 'by-category', title: 'Inventory by category', kind: 'table',
                columns: [
                    { key: 'category', label: 'Category', format: 'text' },
                    { key: 'count', label: 'Products', format: 'number', align: 'right' },
                    { key: 'units', label: 'Units', format: 'number', align: 'right' },
                    { key: 'value', label: 'Stock value', format: 'currency', align: 'right' },
                ],
                rows: categoryRows,
            },
            {
                id: 'approval', title: 'Approval pipeline', kind: 'table',
                columns: [{ key: 'status', label: 'Approval status', format: 'text' }, { key: 'count', label: 'Products', format: 'number', align: 'right' }],
                rows: approvalRows,
            },
            {
                id: 'origin', title: 'Products by origin', kind: 'table',
                columns: [{ key: 'origin', label: 'Origin', format: 'text' }, { key: 'count', label: 'Products', format: 'number', align: 'right' }],
                rows: originRows,
            },
            {
                id: 'low-stock', title: 'Low-stock products (≤5 units)', kind: 'table',
                columns: [
                    { key: 'name', label: 'Product', format: 'text' },
                    { key: 'category', label: 'Category', format: 'text' },
                    { key: 'qty', label: 'Units left', format: 'number', align: 'right' },
                    { key: 'state', label: 'State', format: 'text' },
                ],
                rows: lowRows, note: lowRows.length ? undefined : 'No low-stock products — inventory is healthy.',
            },
            {
                id: 'out-of-stock', title: 'Out-of-stock products', kind: 'table',
                columns: [
                    { key: 'name', label: 'Product', format: 'text' },
                    { key: 'category', label: 'Category', format: 'text' },
                    { key: 'qty', label: 'Warehouse qty', format: 'number', align: 'right' },
                ],
                rows: outRows, note: outRows.length ? undefined : 'Nothing is out of stock.',
            },
        ],
    });
}

// ── Returns & Refunds ────────────────────────────────────────────────────────
async function returnsReport(scope, from, to) {
    const where = {
        createdAt: { gte: from, lte: to },
        ...(scope.storeId ? { order: { storeId: scope.storeId } } : {}),
    };
    const [returns, paidOrdersCount] = await Promise.all([
        prisma.return.findMany({ where, select: { id: true, status: true, reason: true, createdAt: true, orderId: true }, orderBy: { createdAt: 'desc' }, take: 500 }),
        prisma.order.count({ where: { paymentStatus: 'PAID', createdAt: { gte: from, lte: to }, ...(scope.storeId ? { storeId: scope.storeId } : {}) } }),
    ]);

    const count = (s) => returns.filter((r) => r.status === s).length;
    const decided = count('APPROVED') + count('COMPLETED') + count('REJECTED');
    const approvalRate = pct(count('APPROVED') + count('COMPLETED'), decided);

    const statusRows = [...groupBy(returns, (r) => r.status, () => 0, (a) => a + 1).entries()].map(([status, c]) => ({ status, count: c }));
    const reasonRows = [...groupBy(returns, (r) => (r.reason || 'Unspecified').trim().slice(0, 80), () => 0, (a) => a + 1).entries()].map(([reason, c]) => ({ reason, count: c })).sort((a, b) => b.count - a.count).slice(0, 20);

    // Store breakdown (admin/financial only — sellers already scoped to one store).
    let storeSection = null;
    if (!scope.storeId && returns.length) {
        const orderIds = [...new Set(returns.map((r) => r.orderId))];
        const orders = await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, storeId: true } });
        const orderStore = new Map(orders.map((o) => [o.id, o.storeId]));
        const storeIds = [...new Set([...orderStore.values()].filter(Boolean))];
        const stores = storeIds.length ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : [];
        const storeName = new Map(stores.map((s) => [s.id, s.name]));
        const rows = [...groupBy(returns, (r) => orderStore.get(r.orderId) || null, () => 0, (a) => a + 1).entries()]
            .map(([sid, c]) => ({ store: sid ? (storeName.get(sid) || 'Store') : 'External / no store', count: c }))
            .sort((a, b) => b.count - a.count);
        storeSection = {
            id: 'by-store', title: 'Returns by store', kind: 'table',
            columns: [{ key: 'store', label: 'Store', format: 'text' }, { key: 'count', label: 'Returns', format: 'number', align: 'right' }],
            rows,
        };
    }

    const recent = returns.slice(0, 100).map((r) => ({ createdAt: r.createdAt, orderId: r.orderId.slice(0, 12).toUpperCase(), reason: r.reason, status: r.status }));

    return finalize('returns', scope, from, to, {
        kpis: [
            { label: 'Total returns', value: returns.length, format: 'number' },
            { label: 'Requested', value: count('REQUESTED'), format: 'number' },
            { label: 'Approved', value: count('APPROVED'), format: 'number' },
            { label: 'Completed', value: count('COMPLETED'), format: 'number' },
            { label: 'Rejected', value: count('REJECTED'), format: 'number' },
            { label: 'Return rate', value: pct(returns.length, paidOrdersCount), format: 'percent' },
            { label: 'Approval rate', value: approvalRate, format: 'percent' },
        ],
        sections: [
            { id: 'returns-trend', title: 'Returns per day', kind: 'timeseries', valueFormat: 'number', data: bucketByDay(returns, 'createdAt', null) },
            {
                id: 'by-status', title: 'Returns by status', kind: 'table',
                columns: [{ key: 'status', label: 'Status', format: 'text' }, { key: 'count', label: 'Returns', format: 'number', align: 'right' }],
                rows: statusRows,
            },
            {
                id: 'reasons', title: 'Top return reasons', kind: 'table',
                columns: [{ key: 'reason', label: 'Reason', format: 'text' }, { key: 'count', label: 'Returns', format: 'number', align: 'right' }],
                rows: reasonRows, note: reasonRows.length ? undefined : 'No returns in this period.',
            },
            ...(storeSection ? [storeSection] : []),
            {
                id: 'recent', title: 'Return requests', kind: 'table',
                columns: [
                    { key: 'createdAt', label: 'Date', format: 'date' },
                    { key: 'orderId', label: 'Order', format: 'text' },
                    { key: 'reason', label: 'Reason', format: 'text' },
                    { key: 'status', label: 'Status', format: 'text' },
                ],
                rows: recent, note: recent.length ? undefined : 'No return requests in this period.',
            },
        ],
    });
}

// ── Store Performance (admin only) ───────────────────────────────────────────
async function storesReport(scope, from, to) {
    const [stores, rangeOrders, newStores] = await Promise.all([
        prisma.store.findMany({ select: { id: true, name: true, username: true, isActive: true, status: true, sellerModel: true, createdAt: true } }),
        prisma.order.findMany({ where: { paymentStatus: 'PAID', createdAt: { gte: from, lte: to }, storeId: { not: null } }, select: { storeId: true, total: true, commission: true } }),
        prisma.store.count({ where: { createdAt: { gte: from, lte: to } } }),
    ]);

    const productCounts = await prisma.product.groupBy({ by: ['storeId'], _count: { _all: true } });
    const productMap = new Map(productCounts.map((p) => [p.storeId, p._count._all]));

    const perStore = groupBy(
        rangeOrders, (o) => o.storeId,
        () => ({ orders: 0, revenue: 0, commission: 0 }),
        (acc, o) => ({ orders: acc.orders + 1, revenue: acc.revenue + Number(o.total || 0), commission: acc.commission + sumCommission(o) })
    );

    const rows = stores.map((s) => {
        const agg = perStore.get(s.id) || { orders: 0, revenue: 0, commission: 0 };
        return {
            store: s.name, username: s.username, orders: agg.orders, revenue: round(agg.revenue),
            aov: agg.orders ? round(agg.revenue / agg.orders) : 0, commission: round(agg.commission),
            products: productMap.get(s.id) || 0, state: s.isActive ? 'Active' : (s.status || 'inactive'),
        };
    }).sort((a, b) => b.revenue - a.revenue);

    const activeCount = stores.filter((s) => s.isActive).length;
    const pendingCount = stores.filter((s) => String(s.status).toLowerCase() === 'pending').length;
    const totalRevenue = rangeOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const modelRows = [...groupBy(stores, (s) => s.sellerModel || 'LOCAL_SELLER', () => 0, (a) => a + 1).entries()].map(([model, count]) => ({ model: model === 'FULL_MANAGED' ? 'Full-managed' : 'Local seller', count }));
    const statusRows = [...groupBy(stores, (s) => (s.status || 'unknown'), () => 0, (a) => a + 1).entries()].map(([status, count]) => ({ status, count }));

    return finalize('stores', scope, from, to, {
        kpis: [
            { label: 'Total stores', value: stores.length, format: 'number' },
            { label: 'Active stores', value: activeCount, format: 'number' },
            { label: 'Pending stores', value: pendingCount, format: 'number' },
            { label: 'New stores (range)', value: newStores, format: 'number' },
            { label: 'Revenue (range)', value: round(totalRevenue), format: 'currency' },
            { label: 'Orders (range)', value: rangeOrders.length, format: 'number' },
            { label: 'Avg revenue / active store', value: activeCount ? round(totalRevenue / activeCount) : 0, format: 'currency' },
        ],
        sections: [
            {
                id: 'store-table', title: 'Store performance', kind: 'table',
                columns: [
                    { key: 'store', label: 'Store', format: 'text' },
                    { key: 'username', label: 'Username', format: 'text' },
                    { key: 'orders', label: 'Paid orders', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                    { key: 'aov', label: 'AOV', format: 'currency', align: 'right' },
                    { key: 'commission', label: 'Commission', format: 'currency', align: 'right' },
                    { key: 'products', label: 'Products', format: 'number', align: 'right' },
                    { key: 'state', label: 'State', format: 'text' },
                ],
                rows,
            },
            {
                id: 'by-model', title: 'Stores by seller model', kind: 'table',
                columns: [{ key: 'model', label: 'Seller model', format: 'text' }, { key: 'count', label: 'Stores', format: 'number', align: 'right' }],
                rows: modelRows,
            },
            {
                id: 'by-status', title: 'Stores by status', kind: 'table',
                columns: [{ key: 'status', label: 'Status', format: 'text' }, { key: 'count', label: 'Stores', format: 'number', align: 'right' }],
                rows: statusRows,
            },
        ],
    });
}

// Dispatch table.
const COMPUTERS = {
    sales: salesReport,
    payments: paymentsReport,
    payouts: payoutsReport,
    deliveries: deliveriesReport,
    catalog: catalogReport,
    returns: returnsReport,
    stores: storesReport,
};

// Compute a report. `scope` MUST come from resolveReportScope (never the client)
// and the caller MUST have already checked `type` is in `scope.allowed`.
export async function computeReport({ type, scope, from, to }) {
    const fn = COMPUTERS[type];
    if (!fn) throw new Error(`Unknown report type: ${type}`);
    return fn(scope, from, to);
}
