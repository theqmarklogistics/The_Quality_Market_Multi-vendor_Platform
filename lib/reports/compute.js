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

// Merge the per-report payload with the shared meta envelope. `filters` (optional)
// declares self-describing filter controls the UI renders — each carries its own
// options and current value; `subtitle` (optional) is a focus line shown under the
// report title (and on the PDF/CSV) e.g. when a single entity is selected.
function finalize(type, scope, from, to, payload) {
    const def = REPORTS[type];
    return {
        type,
        title: def?.title || type,
        area: def?.area || '',
        scopeLabel: scope.scopeLabel,
        subtitle: payload.subtitle || null,
        currency: CURRENCY,
        range: { from: from.toISOString(), to: to.toISOString(), label: rangeLabel(from, to) },
        generatedAt: new Date().toISOString(),
        filters: payload.filters || [],
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
            id: true, total: true, createdAt: true, status: true, userId: true, storeId: true,
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

    // Store & management-model breakdown — which revenue comes from fully-managed
    // stores vs local (half-managed) sellers. Platform-scoped reports only; a
    // seller's own sales report is already limited to their single store.
    let storeSections = [];
    if (!scope.storeId) {
        const storeIds = [...new Set(paid.map((o) => o.storeId).filter(Boolean))];
        const storeList = storeIds.length
            ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true, sellerModel: true } })
            : [];
        const storeMap = new Map(storeList.map((s) => [s.id, s]));

        const byStore = groupBy(
            paid.filter((o) => o.storeId), (o) => o.storeId,
            () => ({ orders: 0, revenue: 0 }),
            (acc, o) => ({ orders: acc.orders + 1, revenue: acc.revenue + Number(o.total || 0) })
        );

        const storeRows = [...byStore.entries()]
            .map(([id, v]) => ({
                store: storeMap.get(id)?.name || 'Archived store',
                model: prettySellerModel(storeMap.get(id)?.sellerModel),
                orders: v.orders, revenue: round(v.revenue), share: share(v.revenue, revenue),
            }))
            .sort((a, b) => b.revenue - a.revenue);

        // Roll the per-store figures up to the two management models.
        const modelAgg = new Map();
        for (const [id, v] of byStore.entries()) {
            const key = storeMap.get(id)?.sellerModel === 'FULL_MANAGED' ? 'FULL_MANAGED' : 'LOCAL_SELLER';
            const cur = modelAgg.get(key) || { stores: 0, orders: 0, revenue: 0 };
            cur.stores += 1; cur.orders += v.orders; cur.revenue += v.revenue;
            modelAgg.set(key, cur);
        }
        const modelRows = [...modelAgg.entries()]
            .map(([key, v]) => ({ model: prettySellerModel(key), stores: v.stores, orders: v.orders, revenue: round(v.revenue), share: share(v.revenue, revenue) }))
            .sort((a, b) => b.revenue - a.revenue);

        storeSections = [
            {
                id: 'by-store-model', title: 'Revenue by store management model', kind: 'table',
                columns: [
                    { key: 'model', label: 'Management model', format: 'text' },
                    { key: 'stores', label: 'Stores', format: 'number', align: 'right' },
                    { key: 'orders', label: 'Paid orders', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                    { key: 'share', label: '% of revenue', format: 'percent', align: 'right' },
                ],
                rows: modelRows,
                note: modelRows.length ? undefined : 'No store sales in this period.',
            },
            {
                id: 'by-store', title: 'Sales by store (with management model)', kind: 'table',
                columns: [
                    { key: 'store', label: 'Store', format: 'text' },
                    { key: 'model', label: 'Management model', format: 'text' },
                    { key: 'orders', label: 'Paid orders', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                    { key: 'share', label: '% of revenue', format: 'percent', align: 'right' },
                ],
                rows: storeRows,
                note: storeRows.length ? undefined : 'No store sales in this period.',
            },
        ];
    }

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
            ...storeSections,
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

// FULL_MANAGED stores are run end-to-end by the platform; LOCAL_SELLER stores are
// merchant-operated with the platform handling fulfilment/logistics only, hence
// "half-managed" in operator language.
function prettySellerModel(m) {
    return m === 'FULL_MANAGED' ? 'Full-managed' : 'Local seller (Half-managed)';
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
            store: s.name, username: s.username, model: prettySellerModel(s.sellerModel),
            orders: agg.orders, revenue: round(agg.revenue),
            aov: agg.orders ? round(agg.revenue / agg.orders) : 0, commission: round(agg.commission),
            products: productMap.get(s.id) || 0, state: s.isActive ? 'Active' : (s.status || 'inactive'),
        };
    }).sort((a, b) => b.revenue - a.revenue);

    const activeCount = stores.filter((s) => s.isActive).length;
    const pendingCount = stores.filter((s) => String(s.status).toLowerCase() === 'pending').length;
    const totalRevenue = rangeOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const modelRows = [...groupBy(stores, (s) => s.sellerModel || 'LOCAL_SELLER', () => 0, (a) => a + 1).entries()].map(([model, count]) => ({ model: prettySellerModel(model), count }));
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
                    { key: 'model', label: 'Management model', format: 'text' },
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

// ── Rider Performance (admin + logistics manager) ────────────────────────────
// A rider-centric view of the delivery network: who is riding, how many corridor
// runs and stops each covered, delivery success, distance and fees, plus the full
// contact roster and the recurring public-schedule coverage. Riders are salaried
// staff (no per-delivery payout), so this measures workload & reliability — not pay.
async function ridersReport(scope, from, to, options = {}) {
    // 1) The rider workforce — role RIDER users + their dispatch profile card.
    const riderUsers = await prisma.user.findMany({ where: { role: 'RIDER' }, select: { id: true, name: true, email: true, isActive: true } });
    const riderUserIds = riderUsers.map((u) => u.id);
    const profiles = riderUserIds.length
        ? await prisma.riderProfile.findMany({ where: { userId: { in: riderUserIds } }, select: { userId: true, phone: true, vehicleType: true, isActive: true } })
        : [];
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    const riderInfo = new Map();
    for (const u of riderUsers) {
        const p = profileMap.get(u.id);
        riderInfo.set(u.id, {
            name: u.name, email: u.email, phone: p?.phone || null,
            vehicleType: p?.vehicleType || null,
            active: u.isActive !== false && p?.isActive !== false,
        });
    }

    // 2) Corridor runs in the window.
    const corridors = await prisma.deliveryCorridor.findMany({
        where: { runDate: { gte: from, lte: to } },
        select: { id: true, name: true, status: true, runDate: true, assignedRiderId: true },
        orderBy: { runDate: 'desc' }, take: 1000,
    });
    const corridorIds = corridors.map((c) => c.id);

    // Backfill names for any assigned rider not tagged role=RIDER (defensive).
    const assignedIds = [...new Set(corridors.map((c) => c.assignedRiderId).filter(Boolean))];
    const missingIds = assignedIds.filter((id) => !riderInfo.has(id));
    if (missingIds.length) {
        const extra = await prisma.user.findMany({ where: { id: { in: missingIds } }, select: { id: true, name: true, email: true, isActive: true } });
        for (const u of extra) riderInfo.set(u.id, { name: u.name, email: u.email, phone: null, vehicleType: null, active: u.isActive !== false });
    }
    const riderName = (id) => riderInfo.get(id)?.name || 'Rider';

    // 3) Stops (orders) belonging to those corridor runs.
    const stops = corridorIds.length
        ? await prisma.order.findMany({
            where: { corridorId: { in: corridorIds } },
            select: { corridorId: true, deliveryStatus: true, deliveredAt: true, deliveryAttempts: true, deliveryDistanceKm: true, shippingCost: true, paymentStatus: true, failureReason: true, podPhotoUrl: true },
        })
        : [];
    const stopsByCorridor = new Map();
    for (const s of stops) {
        if (!stopsByCorridor.has(s.corridorId)) stopsByCorridor.set(s.corridorId, []);
        stopsByCorridor.get(s.corridorId).push(s);
    }
    const isDelivered = (s) => s.deliveryStatus === 'DELIVERED' || !!s.deliveredAt;

    // 4) Per-rider aggregation across their runs and the stops within them.
    const perRider = new Map();
    const seed = () => ({ runs: 0, completed: 0, inTransit: 0, stops: 0, delivered: 0, failed: 0, distance: 0, attempts: 0, fees: 0, pod: 0, days: new Set() });
    const bump = (id) => { if (!perRider.has(id)) perRider.set(id, seed()); return perRider.get(id); };

    for (const c of corridors) {
        if (!c.assignedRiderId) continue;
        const a = bump(c.assignedRiderId);
        a.runs += 1;
        if (c.status === 'COMPLETED') a.completed += 1;
        if (c.status === 'IN_TRANSIT') a.inTransit += 1;
        a.days.add(new Date(c.runDate).toISOString().slice(0, 10));
        for (const s of (stopsByCorridor.get(c.id) || [])) {
            a.stops += 1;
            if (isDelivered(s)) a.delivered += 1;
            if (s.deliveryStatus === 'FAILED') a.failed += 1;
            a.distance += Number(s.deliveryDistanceKm || 0);
            a.attempts += Number(s.deliveryAttempts || 0);
            if (s.paymentStatus === 'PAID') a.fees += Number(s.shippingCost || 0);
            if (s.podPhotoUrl) a.pod += 1;
        }
    }

    // 5) Network-wide totals for the KPI band.
    const assignedRuns = corridors.filter((c) => c.assignedRiderId).length;
    const unassignedRuns = corridors.length - assignedRuns;
    const completedRuns = corridors.filter((c) => c.status === 'COMPLETED').length;
    const delivered = stops.filter(isDelivered).length;
    const failed = stops.filter((s) => s.deliveryStatus === 'FAILED').length;
    const totalDistance = stops.reduce((sum, o) => sum + Number(o.deliveryDistanceKm || 0), 0);
    const feesCollected = stops.filter((s) => s.paymentStatus === 'PAID').reduce((sum, o) => sum + Number(o.shippingCost || 0), 0);
    const podCount = stops.filter((s) => s.podPhotoUrl).length;
    const activeRiders = riderUsers.filter((u) => riderInfo.get(u.id)?.active).length;

    // 6) Leaderboard — riders who actually worked in the window.
    const leaderboard = [...perRider.entries()].map(([id, v]) => ({
        rider: riderName(id),
        vehicle: riderInfo.get(id)?.vehicleType || '—',
        days: v.days.size,
        runs: v.runs,
        stops: v.stops,
        delivered: v.delivered,
        failed: v.failed,
        success: pct(v.delivered, v.delivered + v.failed),
        distance: round2(v.distance),
        fees: round(v.fees),
    })).sort((a, b) => b.delivered - a.delivered || b.stops - a.stops);

    // 7) Full roster — every rider, including those idle this period.
    const roster = riderUsers.map((u) => {
        const v = perRider.get(u.id);
        const i = riderInfo.get(u.id);
        return {
            rider: i?.name || 'Rider',
            phone: i?.phone || '—',
            vehicle: i?.vehicleType || '—',
            status: i?.active ? 'Active' : 'Inactive',
            runs: v?.runs || 0,
            stops: v?.stops || 0,
        };
    }).sort((a, b) => b.runs - a.runs || String(a.rider).localeCompare(String(b.rider)));

    const vehicleRows = [...groupBy(riderUsers, (u) => riderInfo.get(u.id)?.vehicleType || 'Unspecified', () => 0, (a) => a + 1).entries()]
        .map(([vehicle, count]) => ({ vehicle, count })).sort((a, b) => b.count - a.count);

    const failureRows = [...groupBy(stops.filter((s) => s.failureReason), (s) => String(s.failureReason).trim().slice(0, 80), () => 0, (a) => a + 1).entries()]
        .map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

    const corridorRows = corridors.slice(0, 200).map((c) => {
        const cstops = stopsByCorridor.get(c.id) || [];
        return {
            runDate: c.runDate, name: c.name,
            rider: c.assignedRiderId ? riderName(c.assignedRiderId) : 'Unassigned',
            stops: cstops.length,
            delivered: cstops.filter(isDelivered).length,
            status: c.status,
        };
    });

    // 8) Recurring public-schedule coverage — planned weekly rider assignments.
    const schedules = await prisma.corridorSchedule.findMany({ where: { isActive: true, riderId: { not: null } }, select: { riderId: true, dayOfWeek: true, departTime: true, corridorRouteId: true } });
    const schedRiderIds = [...new Set(schedules.map((s) => s.riderId).filter(Boolean))];
    const schedMissing = schedRiderIds.filter((id) => !riderInfo.has(id));
    if (schedMissing.length) {
        const extra = await prisma.user.findMany({ where: { id: { in: schedMissing } }, select: { id: true, name: true } });
        for (const u of extra) if (!riderInfo.has(u.id)) riderInfo.set(u.id, { name: u.name, email: null, phone: null, vehicleType: null, active: true });
    }
    // Corridor-route names for the per-rider weekly-schedule detail table.
    const routeIds = [...new Set(schedules.map((s) => s.corridorRouteId).filter(Boolean))];
    const routes = routeIds.length ? await prisma.corridorRoute.findMany({ where: { id: { in: routeIds } }, select: { id: true, name: true } }) : [];
    const routeName = new Map(routes.map((r) => [r.id, r.name]));
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const schedAgg = new Map();
    for (const s of schedules) {
        if (!schedAgg.has(s.riderId)) schedAgg.set(s.riderId, { slots: 0, routes: new Set(), days: new Set() });
        const a = schedAgg.get(s.riderId);
        a.slots += 1; a.routes.add(s.corridorRouteId); a.days.add(s.dayOfWeek);
    }
    const scheduleRows = [...schedAgg.entries()].map(([id, v]) => ({
        rider: riderName(id),
        slots: v.slots,
        corridors: v.routes.size,
        days: [...v.days].sort((a, b) => a - b).map((d) => DAYS[d] ?? d).join(', '),
    })).sort((a, b) => b.slots - a.slots);

    // Rider filter — a self-describing control the UI renders. Selecting a rider
    // re-runs this report focused on that single rider (the branch just below).
    const riderOptions = [
        { value: '', label: 'All riders' },
        ...riderUsers.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
            .map((u) => ({ value: u.id, label: u.name || u.email || 'Rider' })),
    ];
    const requestedId = options.riderId && riderInfo.has(options.riderId) ? options.riderId : '';
    if (requestedId && !riderOptions.some((o) => o.value === requestedId)) {
        riderOptions.push({ value: requestedId, label: riderName(requestedId) });
    }
    const filters = [{ key: 'riderId', label: 'Rider', value: requestedId, options: riderOptions }];

    // ── Individual rider focus ────────────────────────────────────────────────
    // When a specific rider is selected, everything narrows to that rider's own
    // runs, stops, delivery outcomes and weekly schedule.
    if (requestedId) {
        const info = riderInfo.get(requestedId);
        const myCorridors = corridors.filter((c) => c.assignedRiderId === requestedId);
        const myStops = myCorridors.flatMap((c) => stopsByCorridor.get(c.id) || []);

        const del = myStops.filter(isDelivered).length;
        const fail = myStops.filter((s) => s.deliveryStatus === 'FAILED').length;
        const inTransit = myStops.filter((s) => ['SORTING', 'IN_TRANSIT', 'ARRIVING'].includes(s.deliveryStatus)).length;
        const pendingIntake = myStops.filter((s) => s.deliveryStatus === 'PENDING_INTAKE').length;
        const dist = myStops.reduce((sum, o) => sum + Number(o.deliveryDistanceKm || 0), 0);
        const fees = myStops.filter((s) => s.paymentStatus === 'PAID').reduce((sum, o) => sum + Number(o.shippingCost || 0), 0);
        const pod = myStops.filter((s) => s.podPhotoUrl).length;
        const totalAttempts = myStops.reduce((sum, o) => sum + Number(o.deliveryAttempts || 0), 0);
        const avgAttempts = myStops.length ? round2(totalAttempts / myStops.length) : 0;
        const daysWorked = new Set(myCorridors.map((c) => new Date(c.runDate).toISOString().slice(0, 10))).size;
        const completedRunsMine = myCorridors.filter((c) => c.status === 'COMPLETED').length;
        const avgStops = myCorridors.length ? round2(myStops.length / myCorridors.length) : 0;
        const mySlots = schedules.filter((s) => s.riderId === requestedId);

        const profileRow = [{
            phone: info?.phone || '—',
            vehicle: info?.vehicleType || '—',
            status: info?.active ? 'Active' : 'Inactive',
            email: info?.email || '—',
        }];

        const myCorridorRows = myCorridors.map((c) => {
            const cstops = stopsByCorridor.get(c.id) || [];
            return {
                runDate: c.runDate, name: c.name,
                stops: cstops.length,
                delivered: cstops.filter(isDelivered).length,
                failed: cstops.filter((s) => s.deliveryStatus === 'FAILED').length,
                status: c.status,
            };
        });

        const statusRows = [...groupBy(myStops.filter((s) => s.deliveryStatus), (s) => s.deliveryStatus, () => 0, (a) => a + 1).entries()]
            .map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);

        const myFailureRows = [...groupBy(myStops.filter((s) => s.failureReason), (s) => String(s.failureReason).trim().slice(0, 80), () => 0, (a) => a + 1).entries()]
            .map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

        const myScheduleRows = mySlots.map((s) => ({
            dayNum: s.dayOfWeek,
            day: DAYS[s.dayOfWeek] ?? s.dayOfWeek,
            corridor: routeName.get(s.corridorRouteId) || 'Corridor',
            depart: s.departTime || '—',
        })).sort((a, b) => a.dayNum - b.dayNum || String(a.depart).localeCompare(String(b.depart)));

        return finalize('riders', scope, from, to, {
            subtitle: `Rider focus · ${info?.name || 'Rider'}`,
            filters,
            kpis: [
                { label: 'Corridor runs', value: myCorridors.length, format: 'number' },
                { label: 'Completed runs', value: completedRunsMine, format: 'number' },
                { label: 'Days worked', value: daysWorked, format: 'number' },
                { label: 'Stops served', value: myStops.length, format: 'number' },
                { label: 'Delivered', value: del, format: 'number' },
                { label: 'Failed', value: fail, format: 'number' },
                { label: 'Success rate', value: pct(del, del + fail), format: 'percent' },
                { label: 'In transit', value: inTransit, format: 'number' },
                { label: 'Pending intake', value: pendingIntake, format: 'number' },
                { label: 'Avg stops / run', value: avgStops, format: 'number' },
                { label: 'Distance covered (km)', value: round2(dist), format: 'number' },
                { label: 'Avg attempts / stop', value: avgAttempts, format: 'number' },
                { label: 'Delivery fees collected', value: round(fees), format: 'currency' },
                { label: 'Proof-of-delivery photos', value: pod, format: 'number' },
                { label: 'Weekly schedule slots', value: mySlots.length, format: 'number' },
            ],
            sections: [
                {
                    id: 'profile', title: 'Rider profile', kind: 'table',
                    columns: [
                        { key: 'phone', label: 'Phone', format: 'text' },
                        { key: 'vehicle', label: 'Vehicle', format: 'text' },
                        { key: 'status', label: 'Status', format: 'text' },
                        { key: 'email', label: 'Email', format: 'text' },
                    ],
                    rows: profileRow,
                },
                { id: 'runs-trend', title: 'Corridor runs per day', kind: 'timeseries', valueFormat: 'number', data: bucketByDay(myCorridors, 'runDate', null) },
                { id: 'delivered-trend', title: 'Stops delivered per day', kind: 'timeseries', valueFormat: 'number', data: bucketByDay(myStops.filter((s) => s.deliveredAt), 'deliveredAt', null) },
                {
                    id: 'stops-by-status', title: 'Stops by delivery status', kind: 'table',
                    columns: [{ key: 'status', label: 'Status', format: 'text' }, { key: 'count', label: 'Stops', format: 'number', align: 'right' }],
                    rows: statusRows, note: statusRows.length ? undefined : 'No stops served in this period.',
                },
                {
                    id: 'my-corridors', title: 'Corridor runs', kind: 'table',
                    columns: [
                        { key: 'runDate', label: 'Run date', format: 'date' },
                        { key: 'name', label: 'Corridor', format: 'text' },
                        { key: 'stops', label: 'Stops', format: 'number', align: 'right' },
                        { key: 'delivered', label: 'Delivered', format: 'number', align: 'right' },
                        { key: 'failed', label: 'Failed', format: 'number', align: 'right' },
                        { key: 'status', label: 'Status', format: 'text' },
                    ],
                    rows: myCorridorRows, note: myCorridorRows.length ? undefined : 'No corridor runs assigned in this period.',
                },
                {
                    id: 'my-failures', title: 'Failure reasons', kind: 'table',
                    columns: [{ key: 'reason', label: 'Reason', format: 'text' }, { key: 'count', label: 'Stops', format: 'number', align: 'right' }],
                    rows: myFailureRows, note: myFailureRows.length ? undefined : 'No failed stops in this period.',
                },
                {
                    id: 'my-schedule', title: 'Weekly schedule', kind: 'table',
                    columns: [
                        { key: 'day', label: 'Day', format: 'text' },
                        { key: 'corridor', label: 'Corridor', format: 'text' },
                        { key: 'depart', label: 'Departs', format: 'text' },
                    ],
                    rows: myScheduleRows, note: myScheduleRows.length ? undefined : 'This rider is not on the recurring public schedule.',
                },
            ],
        });
    }

    return finalize('riders', scope, from, to, {
        filters,
        kpis: [
            { label: 'Total riders', value: riderUsers.length, format: 'number' },
            { label: 'Active riders', value: activeRiders, format: 'number' },
            { label: 'Riders on shift (range)', value: perRider.size, format: 'number' },
            { label: 'Corridor runs', value: corridors.length, format: 'number' },
            { label: 'Completed runs', value: completedRuns, format: 'number' },
            { label: 'Unassigned runs', value: unassignedRuns, format: 'number' },
            { label: 'Stops served', value: stops.length, format: 'number' },
            { label: 'Delivered', value: delivered, format: 'number' },
            { label: 'Failed', value: failed, format: 'number' },
            { label: 'Success rate', value: pct(delivered, delivered + failed), format: 'percent' },
            { label: 'Distance covered (km)', value: round2(totalDistance), format: 'number' },
            { label: 'Delivery fees (rider-served)', value: round(feesCollected), format: 'currency' },
            { label: 'Proof-of-delivery photos', value: podCount, format: 'number' },
        ],
        sections: [
            { id: 'runs-trend', title: 'Corridor runs per day', kind: 'timeseries', valueFormat: 'number', data: bucketByDay(corridors, 'runDate', null) },
            { id: 'delivered-trend', title: 'Stops delivered per day', kind: 'timeseries', valueFormat: 'number', data: bucketByDay(stops.filter((s) => s.deliveredAt), 'deliveredAt', null) },
            {
                id: 'leaderboard', title: 'Rider leaderboard (this period)', kind: 'table',
                columns: [
                    { key: 'rider', label: 'Rider', format: 'text' },
                    { key: 'vehicle', label: 'Vehicle', format: 'text' },
                    { key: 'days', label: 'Days', format: 'number', align: 'right' },
                    { key: 'runs', label: 'Runs', format: 'number', align: 'right' },
                    { key: 'stops', label: 'Stops', format: 'number', align: 'right' },
                    { key: 'delivered', label: 'Delivered', format: 'number', align: 'right' },
                    { key: 'failed', label: 'Failed', format: 'number', align: 'right' },
                    { key: 'success', label: 'Success', format: 'percent', align: 'right' },
                    { key: 'distance', label: 'Distance km', format: 'number', align: 'right' },
                    { key: 'fees', label: 'Fees', format: 'currency', align: 'right' },
                ],
                rows: leaderboard,
                note: leaderboard.length ? undefined : 'No riders were assigned corridor runs in this period.',
            },
            {
                id: 'roster', title: 'Rider roster & contact', kind: 'table',
                columns: [
                    { key: 'rider', label: 'Rider', format: 'text' },
                    { key: 'phone', label: 'Phone', format: 'text' },
                    { key: 'vehicle', label: 'Vehicle', format: 'text' },
                    { key: 'status', label: 'Status', format: 'text' },
                    { key: 'runs', label: 'Runs (range)', format: 'number', align: 'right' },
                    { key: 'stops', label: 'Stops (range)', format: 'number', align: 'right' },
                ],
                rows: roster,
                note: roster.length ? undefined : 'No riders are registered yet.',
            },
            {
                id: 'schedule-coverage', title: 'Recurring schedule coverage', kind: 'table',
                columns: [
                    { key: 'rider', label: 'Rider', format: 'text' },
                    { key: 'slots', label: 'Weekly slots', format: 'number', align: 'right' },
                    { key: 'corridors', label: 'Corridors', format: 'number', align: 'right' },
                    { key: 'days', label: 'Days covered', format: 'text' },
                ],
                rows: scheduleRows,
                note: scheduleRows.length ? undefined : 'No riders are assigned to the recurring public schedule.',
            },
            {
                id: 'by-vehicle', title: 'Riders by vehicle type', kind: 'table',
                columns: [{ key: 'vehicle', label: 'Vehicle type', format: 'text' }, { key: 'count', label: 'Riders', format: 'number', align: 'right' }],
                rows: vehicleRows,
                note: vehicleRows.length ? undefined : 'No riders are registered yet.',
            },
            {
                id: 'failures', title: 'Failure reasons (rider-served stops)', kind: 'table',
                columns: [{ key: 'reason', label: 'Reason', format: 'text' }, { key: 'count', label: 'Stops', format: 'number', align: 'right' }],
                rows: failureRows,
                note: failureRows.length ? undefined : 'No failed stops in this period.',
            },
            {
                id: 'corridor-runs', title: 'Corridor runs', kind: 'table',
                columns: [
                    { key: 'runDate', label: 'Run date', format: 'date' },
                    { key: 'name', label: 'Corridor', format: 'text' },
                    { key: 'rider', label: 'Rider', format: 'text' },
                    { key: 'stops', label: 'Stops', format: 'number', align: 'right' },
                    { key: 'delivered', label: 'Delivered', format: 'number', align: 'right' },
                    { key: 'status', label: 'Status', format: 'text' },
                ],
                rows: corridorRows,
                note: corridorRows.length ? undefined : 'No corridor runs scheduled in this period.',
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
    riders: ridersReport,
    catalog: catalogReport,
    returns: returnsReport,
    stores: storesReport,
};

// Compute a report. `scope` MUST come from resolveReportScope (never the client)
// and the caller MUST have already checked `type` is in `scope.allowed`. Extra
// per-report options (e.g. `riderId`) are passed through; reports that don't use
// them simply ignore the trailing options argument.
export async function computeReport({ type, scope, from, to, ...options }) {
    const fn = COMPUTERS[type];
    if (!fn) throw new Error(`Unknown report type: ${type}`);
    return fn(scope, from, to, options);
}
