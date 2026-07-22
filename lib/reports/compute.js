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
function sumCommission(order) {
    const items = Array.isArray(order.commission) ? order.commission : [];
    return items.reduce((s, i) => s + (Number(i?.commissionAmount) || 0), 0);
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

// ── Sales & Revenue ──────────────────────────────────────────────────────────
async function salesReport(scope, from, to) {
    const orders = await prisma.order.findMany({
        where: orderRangeWhere(scope, from, to),
        select: { id: true, total: true, createdAt: true, paymentStatus: true, isCouponUsed: true, coupon: true },
    });

    const paid = orders.filter((o) => o.paymentStatus === 'PAID');
    const revenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);
    const aov = paid.length ? revenue / paid.length : 0;

    // Line items of the paid orders → items sold, top products, category mix.
    const paidIds = paid.map((o) => o.id);
    const items = paidIds.length
        ? await prisma.orderItem.findMany({
              where: { orderId: { in: paidIds } },
              select: { productId: true, quantity: true, price: true },
          })
        : [];
    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = productIds.length
        ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, category: true } })
        : [];
    const pmap = new Map(products.map((p) => [p.id, p]));
    const itemsSold = items.reduce((s, i) => s + (i.quantity || 0), 0);

    const byProduct = groupBy(
        items,
        (i) => i.productId,
        () => ({ qty: 0, revenue: 0 }),
        (acc, i) => ({ qty: acc.qty + (i.quantity || 0), revenue: acc.revenue + i.price * i.quantity })
    );
    const topProducts = [...byProduct.entries()]
        .map(([id, v]) => ({ name: pmap.get(id)?.name || 'Unknown product', category: pmap.get(id)?.category || '—', qty: v.qty, revenue: round(v.revenue) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    const byCategory = groupBy(
        items,
        (i) => pmap.get(i.productId)?.category || 'Uncategorised',
        () => ({ qty: 0, revenue: 0 }),
        (acc, i) => ({ qty: acc.qty + (i.quantity || 0), revenue: acc.revenue + i.price * i.quantity })
    );
    const categoryRows = [...byCategory.entries()]
        .map(([category, v]) => ({ category, qty: v.qty, revenue: round(v.revenue) }))
        .sort((a, b) => b.revenue - a.revenue);

    // Coupon usage across ALL orders in range (not only paid).
    const couponRows = [...groupBy(
        orders.filter((o) => o.isCouponUsed && o.coupon && typeof o.coupon === 'object' && o.coupon.code),
        (o) => o.coupon.code,
        () => ({ uses: 0, discount: 0 }),
        (acc, o) => ({ uses: acc.uses + 1, discount: o.coupon.discount || acc.discount })
    ).entries()]
        .map(([code, v]) => ({ code, uses: v.uses, discount: v.discount }))
        .sort((a, b) => b.uses - a.uses);

    return finalize('sales', scope, from, to, {
        kpis: [
            { label: 'Revenue (paid)', value: round(revenue), format: 'currency' },
            { label: 'Paid orders', value: paid.length, format: 'number' },
            { label: 'Total orders', value: orders.length, format: 'number' },
            { label: 'Avg order value', value: round(aov), format: 'currency' },
            { label: 'Items sold', value: itemsSold, format: 'number' },
        ],
        sections: [
            {
                id: 'revenue-trend', title: 'Revenue per day', kind: 'timeseries', valueFormat: 'currency',
                data: bucketByDay(paid, 'createdAt', 'total'),
            },
            {
                id: 'top-products', title: 'Top products by revenue', kind: 'table',
                columns: [
                    { key: 'name', label: 'Product', format: 'text' },
                    { key: 'category', label: 'Category', format: 'text' },
                    { key: 'qty', label: 'Qty sold', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                ],
                rows: topProducts,
            },
            {
                id: 'by-category', title: 'Sales by category', kind: 'table',
                columns: [
                    { key: 'category', label: 'Category', format: 'text' },
                    { key: 'qty', label: 'Qty sold', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                ],
                rows: categoryRows,
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
        select: { total: true, paymentMethod: true, paymentStatus: true, paymentProofStatus: true, escrowStatus: true },
    });

    const paid = orders.filter((o) => o.paymentStatus === 'PAID');
    const collected = paid.reduce((s, o) => s + Number(o.total || 0), 0);
    const pending = orders.filter((o) => o.paymentStatus === 'PENDING').reduce((s, o) => s + Number(o.total || 0), 0);
    const failed = orders.filter((o) => ['FAILED', 'EXPIRED', 'CANCELLED'].includes(o.paymentStatus)).length;
    const proofsAwaiting = orders.filter((o) => o.paymentProofStatus === 'SUBMITTED').length;

    const methodRows = [...groupBy(
        paid,
        (o) => o.paymentMethod || 'UNKNOWN',
        () => ({ orders: 0, amount: 0 }),
        (acc, o) => ({ orders: acc.orders + 1, amount: acc.amount + Number(o.total || 0) })
    ).entries()]
        .map(([method, v]) => ({ method: prettyMethod(method), orders: v.orders, amount: round(v.amount) }))
        .sort((a, b) => b.amount - a.amount);

    const statusRows = [...groupBy(
        orders,
        (o) => o.paymentStatus || 'UNKNOWN',
        () => ({ orders: 0, amount: 0 }),
        (acc, o) => ({ orders: acc.orders + 1, amount: acc.amount + Number(o.total || 0) })
    ).entries()]
        .map(([status, v]) => ({ status, orders: v.orders, amount: round(v.amount) }))
        .sort((a, b) => b.orders - a.orders);

    const proofRows = [...groupBy(
        orders,
        (o) => o.paymentProofStatus || 'NOT_SUBMITTED',
        () => 0,
        (acc) => acc + 1
    ).entries()].map(([status, count]) => ({ status, count }));

    const escrowRows = [...groupBy(
        orders,
        (o) => o.escrowStatus || 'NOT_HELD',
        () => ({ orders: 0, amount: 0 }),
        (acc, o) => ({ orders: acc.orders + 1, amount: acc.amount + Number(o.total || 0) })
    ).entries()].map(([status, v]) => ({ status, orders: v.orders, amount: round(v.amount) }));

    return finalize('payments', scope, from, to, {
        kpis: [
            { label: 'Collected (paid)', value: round(collected), format: 'currency' },
            { label: 'Pending collection', value: round(pending), format: 'currency' },
            { label: 'Failed / expired', value: failed, format: 'number' },
            { label: 'Proofs to review', value: proofsAwaiting, format: 'number' },
        ],
        sections: [
            {
                id: 'by-method', title: 'Collections by payment method', kind: 'table',
                columns: [
                    { key: 'method', label: 'Method', format: 'text' },
                    { key: 'orders', label: 'Paid orders', format: 'number', align: 'right' },
                    { key: 'amount', label: 'Amount', format: 'currency', align: 'right' },
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
    return ({
        STRIPE: 'Card (Stripe)', MTN_MOMO: 'MTN MoMo', AIRTEL_MONEY: 'Airtel Money',
        BANK_TRANSFER: 'Bank transfer', EKASH: 'eKash',
    })[m] || m;
}

// ── Payouts & Commissions ────────────────────────────────────────────────────
async function payoutsReport(scope, from, to) {
    if (scope.storeId) return sellerPayoutsReport(scope, from, to);
    return platformPayoutsReport(scope, from, to);
}

// Seller view — their own earnings, commission and settlement history.
async function sellerPayoutsReport(scope, from, to) {
    const [paidOrders, payouts, paidOutAgg] = await Promise.all([
        prisma.order.findMany({ where: { storeId: scope.storeId, paymentStatus: 'PAID' }, select: { total: true, commission: true } }),
        prisma.payout.findMany({ where: { storeId: scope.storeId }, orderBy: { createdAt: 'desc' }, take: 200 }),
        prisma.payout.aggregate({ where: { storeId: scope.storeId, status: 'PAID' }, _sum: { amount: true } }),
    ]);

    const gross = paidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const commission = paidOrders.reduce((s, o) => s + sumCommission(o), 0);
    const net = gross - commission;
    const paidOut = Number(paidOutAgg?._sum?.amount || 0);
    const unpaid = Math.max(0, net - paidOut);

    const payoutRows = payouts.map((p) => ({
        createdAt: p.createdAt,
        period: `${new Date(p.periodStart).toLocaleDateString('en-RW')} – ${new Date(p.periodEnd).toLocaleDateString('en-RW')}`,
        amount: round(p.amount),
        status: p.status,
    }));

    return finalize('payouts', scope, from, to, {
        kpis: [
            { label: 'Gross sales (all-time)', value: round(gross), format: 'currency' },
            { label: 'Platform commission', value: round(commission), format: 'currency' },
            { label: 'Net earnings', value: round(net), format: 'currency' },
            { label: 'Paid out', value: round(paidOut), format: 'currency' },
            { label: 'Unpaid balance', value: round(unpaid), format: 'currency' },
        ],
        sections: [
            {
                id: 'payout-history', title: 'Payout history', kind: 'table',
                columns: [
                    { key: 'createdAt', label: 'Created', format: 'date' },
                    { key: 'period', label: 'Period', format: 'text' },
                    { key: 'amount', label: 'Amount', format: 'currency', align: 'right' },
                    { key: 'status', label: 'Status', format: 'text' },
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
        prisma.order.findMany({ where: { paymentStatus: 'PAID', createdAt: { gte: from, lte: to } }, select: { commission: true, total: true } }),
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
        allPaidOrders,
        (o) => o.storeId,
        () => ({ gross: 0, commission: 0 }),
        (acc, o) => ({ gross: acc.gross + Number(o.total || 0), commission: acc.commission + sumCommission(o) })
    );

    let totalNet = 0;
    let totalPaidOut = 0;
    const storeRows = [...netByStore.entries()]
        .map(([storeId, v]) => {
            const net = round(v.gross - v.commission);
            const paidOut = round(paidOutMap.get(storeId) || 0);
            totalNet += net;
            totalPaidOut += paidOut;
            return { store: storeMap.get(storeId) || 'Archived store', net, paidOut, unpaid: Math.max(0, net - paidOut) };
        })
        .filter((r) => r.net > 0)
        .sort((a, b) => b.unpaid - a.unpaid);

    // Stores may have been paid out despite being excluded above (net 0); still
    // count their settlements in the platform total.
    for (const [storeId, amt] of paidOutMap.entries()) {
        if (!netByStore.has(storeId)) totalPaidOut += round(amt);
    }

    const payoutRows = rangePayouts.map((p) => ({
        createdAt: p.createdAt,
        store: storeMap.get(p.storeId) || 'Store',
        amount: round(p.amount),
        status: p.status,
    }));

    return finalize('payouts', scope, from, to, {
        kpis: [
            { label: 'Commission earned (range)', value: round(commissionInRange), format: 'currency' },
            { label: 'Gross sales (range)', value: round(grossInRange), format: 'currency' },
            { label: 'Owed to sellers (all-time)', value: round(totalNet), format: 'currency' },
            { label: 'Paid out (all-time)', value: round(totalPaidOut), format: 'currency' },
            { label: 'Outstanding balance', value: round(Math.max(0, totalNet - totalPaidOut)), format: 'currency' },
        ],
        sections: [
            {
                id: 'store-settlements', title: 'Seller settlement snapshot (all-time)', kind: 'table',
                columns: [
                    { key: 'store', label: 'Store', format: 'text' },
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

// ── Deliveries & Logistics (admin only) ──────────────────────────────────────
async function deliveriesReport(scope, from, to) {
    const orders = await prisma.order.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
            deliveryType: true, deliveryStatus: true, status: true, isExternalDelivery: true,
            paymentStatus: true, shippingCost: true, deliveryAttempts: true, failureReason: true,
        },
    });

    const delivered = orders.filter((o) => o.deliveryStatus === 'DELIVERED' || o.status === 'DELIVERED').length;
    const failed = orders.filter((o) => o.deliveryStatus === 'FAILED').length;
    const inTransit = orders.filter((o) => ['SORTING', 'IN_TRANSIT', 'ARRIVING'].includes(o.deliveryStatus) || o.status === 'SHIPPED').length;
    const feesCollected = orders
        .filter((o) => o.paymentStatus === 'PAID')
        .reduce((s, o) => s + Number(o.shippingCost || 0), 0);

    const typeRows = [...groupBy(
        orders,
        (o) => o.deliveryType || 'STANDARD_UNPOOLED',
        () => 0,
        (acc) => acc + 1
    ).entries()].map(([type, count]) => ({ type: prettyDeliveryType(type), count }));

    const poolStatusRows = [...groupBy(
        orders.filter((o) => o.deliveryStatus),
        (o) => o.deliveryStatus,
        () => 0,
        (acc) => acc + 1
    ).entries()].map(([status, count]) => ({ status, count }));

    // Corridor runs in the window + how many stops (orders) each carried.
    const corridors = await prisma.deliveryCorridor.findMany({
        where: { runDate: { gte: from, lte: to } },
        select: { id: true, name: true, status: true, runDate: true, assignedRiderId: true },
        orderBy: { runDate: 'desc' },
        take: 200,
    });
    const corridorIds = corridors.map((c) => c.id);
    const stopsAgg = corridorIds.length
        ? await prisma.order.groupBy({ by: ['corridorId'], where: { corridorId: { in: corridorIds } }, _count: { _all: true } })
        : [];
    const stopsMap = new Map(stopsAgg.map((s) => [s.corridorId, s._count._all]));
    const riderIds = [...new Set(corridors.map((c) => c.assignedRiderId).filter(Boolean))];
    const riders = riderIds.length
        ? await prisma.user.findMany({ where: { id: { in: riderIds } }, select: { id: true, name: true } })
        : [];
    const riderMap = new Map(riders.map((u) => [u.id, u.name]));

    const corridorRows = corridors.map((c) => ({
        runDate: c.runDate,
        name: c.name,
        rider: c.assignedRiderId ? (riderMap.get(c.assignedRiderId) || 'Rider') : 'Unassigned',
        stops: stopsMap.get(c.id) || 0,
        status: c.status,
    }));

    return finalize('deliveries', scope, from, to, {
        kpis: [
            { label: 'Shipments (range)', value: orders.length, format: 'number' },
            { label: 'Delivered', value: delivered, format: 'number' },
            { label: 'In transit', value: inTransit, format: 'number' },
            { label: 'Failed', value: failed, format: 'number' },
            { label: 'Delivery fees collected', value: round(feesCollected), format: 'currency' },
        ],
        sections: [
            {
                id: 'by-type', title: 'Shipments by delivery type', kind: 'table',
                columns: [
                    { key: 'type', label: 'Delivery type', format: 'text' },
                    { key: 'count', label: 'Shipments', format: 'number', align: 'right' },
                ],
                rows: typeRows,
            },
            {
                id: 'pool-status', title: 'Pooled delivery status breakdown', kind: 'table',
                columns: [
                    { key: 'status', label: 'Status', format: 'text' },
                    { key: 'count', label: 'Shipments', format: 'number', align: 'right' },
                ],
                rows: poolStatusRows,
                note: poolStatusRows.length ? undefined : 'No pooled deliveries in this period.',
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
                rows: corridorRows,
                note: corridorRows.length ? undefined : 'No corridor runs scheduled in this period.',
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

    const [total, inStock, outOfStock, lowStock, pending, lowStockRows] = await Promise.all([
        prisma.product.count({ where: storeWhere }),
        prisma.product.count({ where: { ...storeWhere, inStock: true } }),
        prisma.product.count({ where: { ...storeWhere, inStock: false } }),
        prisma.product.count({ where: { ...storeWhere, warehouseQuantity: { lte: 5 }, approvalStatus: 'APPROVED' } }),
        prisma.product.count({ where: { ...storeWhere, approvalStatus: 'PENDING' } }),
        prisma.product.findMany({
            where: { ...storeWhere, warehouseQuantity: { lte: 5 }, approvalStatus: 'APPROVED' },
            select: { name: true, category: true, warehouseQuantity: true, inStock: true },
            orderBy: { warehouseQuantity: 'asc' },
            take: 50,
        }),
    ]);

    // Best sellers by quantity in the window (scoped to the seller's products).
    const paidOrders = await prisma.order.findMany({
        where: { paymentStatus: 'PAID', createdAt: { gte: from, lte: to }, ...(scope.storeId ? { storeId: scope.storeId } : {}) },
        select: { id: true },
    });
    const paidIds = paidOrders.map((o) => o.id);
    const items = paidIds.length
        ? await prisma.orderItem.findMany({ where: { orderId: { in: paidIds } }, select: { productId: true, quantity: true, price: true } })
        : [];
    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = productIds.length
        ? await prisma.product.findMany({ where: { id: { in: productIds }, ...storeWhere }, select: { id: true, name: true } })
        : [];
    const pmap = new Map(products.map((p) => [p.id, p.name]));
    const bestByProduct = groupBy(
        items.filter((i) => pmap.has(i.productId)),
        (i) => i.productId,
        () => ({ qty: 0, revenue: 0 }),
        (acc, i) => ({ qty: acc.qty + (i.quantity || 0), revenue: acc.revenue + i.price * i.quantity })
    );
    const bestSellers = [...bestByProduct.entries()]
        .map(([id, v]) => ({ name: pmap.get(id) || 'Product', qty: v.qty, revenue: round(v.revenue) }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 15);

    const lowRows = lowStockRows.map((p) => ({
        name: p.name, category: p.category, qty: p.warehouseQuantity,
        state: p.inStock ? 'In stock' : 'Out of stock',
    }));

    return finalize('catalog', scope, from, to, {
        kpis: [
            { label: 'Total products', value: total, format: 'number' },
            { label: 'In stock', value: inStock, format: 'number' },
            { label: 'Out of stock', value: outOfStock, format: 'number' },
            { label: 'Low stock (≤5)', value: lowStock, format: 'number' },
            { label: 'Pending approval', value: pending, format: 'number' },
        ],
        sections: [
            {
                id: 'best-sellers', title: 'Best sellers (this period)', kind: 'table',
                columns: [
                    { key: 'name', label: 'Product', format: 'text' },
                    { key: 'qty', label: 'Qty sold', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                ],
                rows: bestSellers,
                note: bestSellers.length ? undefined : 'No units sold in this period.',
            },
            {
                id: 'low-stock', title: 'Low-stock products (≤5 units)', kind: 'table',
                columns: [
                    { key: 'name', label: 'Product', format: 'text' },
                    { key: 'category', label: 'Category', format: 'text' },
                    { key: 'qty', label: 'Units left', format: 'number', align: 'right' },
                    { key: 'state', label: 'State', format: 'text' },
                ],
                rows: lowRows,
                note: lowRows.length ? undefined : 'No low-stock products — inventory is healthy.',
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
    const returns = await prisma.return.findMany({
        where,
        select: { id: true, status: true, reason: true, createdAt: true, orderId: true },
        orderBy: { createdAt: 'desc' },
        take: 300,
    });

    const count = (s) => returns.filter((r) => r.status === s).length;
    const statusRows = [...groupBy(returns, (r) => r.status, () => 0, (acc) => acc + 1).entries()]
        .map(([status, c]) => ({ status, count: c }));

    const recent = returns.slice(0, 100).map((r) => ({
        createdAt: r.createdAt,
        orderId: r.orderId.slice(0, 12).toUpperCase(),
        reason: r.reason,
        status: r.status,
    }));

    return finalize('returns', scope, from, to, {
        kpis: [
            { label: 'Total returns', value: returns.length, format: 'number' },
            { label: 'Requested', value: count('REQUESTED'), format: 'number' },
            { label: 'Approved', value: count('APPROVED'), format: 'number' },
            { label: 'Completed', value: count('COMPLETED'), format: 'number' },
            { label: 'Rejected', value: count('REJECTED'), format: 'number' },
        ],
        sections: [
            {
                id: 'by-status', title: 'Returns by status', kind: 'table',
                columns: [
                    { key: 'status', label: 'Status', format: 'text' },
                    { key: 'count', label: 'Returns', format: 'number', align: 'right' },
                ],
                rows: statusRows,
            },
            {
                id: 'recent', title: 'Return requests', kind: 'table',
                columns: [
                    { key: 'createdAt', label: 'Date', format: 'date' },
                    { key: 'orderId', label: 'Order', format: 'text' },
                    { key: 'reason', label: 'Reason', format: 'text' },
                    { key: 'status', label: 'Status', format: 'text' },
                ],
                rows: recent,
                note: recent.length ? undefined : 'No return requests in this period.',
            },
        ],
    });
}

// ── Store Performance (admin only) ───────────────────────────────────────────
async function storesReport(scope, from, to) {
    const [stores, rangeOrders, newStores] = await Promise.all([
        prisma.store.findMany({ select: { id: true, name: true, username: true, isActive: true, createdAt: true } }),
        prisma.order.findMany({ where: { paymentStatus: 'PAID', createdAt: { gte: from, lte: to }, storeId: { not: null } }, select: { storeId: true, total: true } }),
        prisma.store.count({ where: { createdAt: { gte: from, lte: to } } }),
    ]);

    const productCounts = await prisma.product.groupBy({ by: ['storeId'], _count: { _all: true } });
    const productMap = new Map(productCounts.map((p) => [p.storeId, p._count._all]));

    const perStore = groupBy(
        rangeOrders,
        (o) => o.storeId,
        () => ({ orders: 0, revenue: 0 }),
        (acc, o) => ({ orders: acc.orders + 1, revenue: acc.revenue + Number(o.total || 0) })
    );

    const rows = stores
        .map((s) => {
            const agg = perStore.get(s.id) || { orders: 0, revenue: 0 };
            return {
                store: s.name,
                username: s.username,
                orders: agg.orders,
                revenue: round(agg.revenue),
                products: productMap.get(s.id) || 0,
                active: s.isActive ? 'Active' : 'Inactive',
            };
        })
        .sort((a, b) => b.revenue - a.revenue);

    const activeCount = stores.filter((s) => s.isActive).length;

    return finalize('stores', scope, from, to, {
        kpis: [
            { label: 'Total stores', value: stores.length, format: 'number' },
            { label: 'Active stores', value: activeCount, format: 'number' },
            { label: 'New stores (range)', value: newStores, format: 'number' },
            { label: 'Revenue (range)', value: round(rangeOrders.reduce((s, o) => s + Number(o.total || 0), 0)), format: 'currency' },
        ],
        sections: [
            {
                id: 'store-table', title: 'Store performance', kind: 'table',
                columns: [
                    { key: 'store', label: 'Store', format: 'text' },
                    { key: 'username', label: 'Username', format: 'text' },
                    { key: 'orders', label: 'Paid orders', format: 'number', align: 'right' },
                    { key: 'revenue', label: 'Revenue', format: 'currency', align: 'right' },
                    { key: 'products', label: 'Products', format: 'number', align: 'right' },
                    { key: 'active', label: 'State', format: 'text' },
                ],
                rows,
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
