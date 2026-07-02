import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { logAdminAction } from "@/lib/auditLog";
import { maybeSweepExpiredOrders } from "@/lib/expireOrders";

const ALLOWED_ORDER_STATUSES = ["ORDER_PLACED", "PROCESSING", "SHIPPED", "DELIVERED", "OTHER"];

const VALID_TRANSITIONS = {
    ORDER_PLACED: ['PROCESSING'],
    PROCESSING:   ['SHIPPED'],
    SHIPPED:      ['DELIVERED'],
    DELIVERED:    [],
};

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Lazy expiry (throttled, best-effort) — replaces the old expiry cron.
        maybeSweepExpiredOrders();

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
        const status = searchParams.get('status') || '';
        const search = searchParams.get('search')?.trim() || '';

        const where = {};
        if (status) where.status = status;
        if (search) where.user = { name: { contains: search, mode: 'insensitive' } };

        const [rawOrders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.order.count({ where })
        ]);

        // Hydrate orderItems, products, users, stores, addresses separately (no include)
        let orders = rawOrders;
        if (rawOrders.length) {
            const orderIds = rawOrders.map(o => o.id);
            const userIds = [...new Set(rawOrders.map(o => o.userId).filter(Boolean))];
            const storeIds = [...new Set(rawOrders.map(o => o.storeId).filter(Boolean))];
            const addressIds = [...new Set(rawOrders.map(o => o.addressId).filter(Boolean))];

            const [orderItems, users, stores, addresses] = await Promise.all([
                prisma.orderItem.findMany({ where: { orderId: { in: orderIds } } }),
                prisma.user.findMany({ where: { id: { in: userIds } } }),
                prisma.store.findMany({ where: { id: { in: storeIds } } }),
                prisma.address.findMany({ where: { id: { in: addressIds } } })
            ]);

            const productIds = [...new Set(orderItems.map(i => i.productId).filter(Boolean))];
            const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } } }) : [];

            const productMap = new Map(products.map(p => [p.id, p]));
            const userMap = new Map(users.map(u => [u.id, u]));
            const storeMap = new Map(stores.map(s => [s.id, s]));
            const addressMap = new Map(addresses.map(a => [a.id, a]));
            const orderItemsByOrder = new Map();
            for (const item of orderItems) {
                if (!orderItemsByOrder.has(item.orderId)) orderItemsByOrder.set(item.orderId, []);
                orderItemsByOrder.get(item.orderId).push({ ...item, product: productMap.get(item.productId) || null });
            }

            orders = rawOrders.map(o => ({
                ...o,
                orderItems: orderItemsByOrder.get(o.id) || [],
                user: userMap.get(o.userId) || null,
                store: storeMap.get(o.storeId) || null,
                address: addressMap.get(o.addressId) || null
            }));
        }

        return NextResponse.json({ orders, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orderId, status, customStatusLabel, publicStatusNote } = await request.json();

        if (!orderId || !status) {
            return NextResponse.json({ error: "Missing order update details" }, { status: 400 });
        }

        if (!ALLOWED_ORDER_STATUSES.includes(status)) {
            return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
        }

        const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const allowed = VALID_TRANSITIONS[order.status] || [];
        if (status !== 'OTHER' && !allowed.includes(status)) {
            return NextResponse.json({
                error: `Cannot transition from ${order.status} to ${status}. Expected: ${allowed.join(', ') || 'none'}`
            }, { status: 400 });
        }

        const updateData = { status };
        if (status === 'OTHER') {
            updateData.customStatusLabel = customStatusLabel?.trim() || 'Other';
        }
        if (publicStatusNote !== undefined) {
            updateData.publicStatusNote = publicStatusNote?.trim() || null;
        }

        await prisma.order.update({ where: { id: orderId }, data: updateData });

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        const label = status === 'OTHER' ? (customStatusLabel?.trim() || 'Other') : status;
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: 'ORDER_STATUS_UPDATED', targetType: 'Order', targetId: orderId, notes: `${order.status} → ${label}` });

        return NextResponse.json({ message: "Order status updated successfully" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
