import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || '';
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = 20;

        const where = status ? { status } : {};

        const [rawReturns, total] = await Promise.all([
            prisma.return.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.return.count({ where }),
        ]);

        // Hydrate users, orders, orderItems, products separately (no include)
        let returns = rawReturns;
        if (rawReturns.length) {
            const userIds = [...new Set(rawReturns.map(r => r.userId).filter(Boolean))];
            const orderIds = [...new Set(rawReturns.map(r => r.orderId).filter(Boolean))];

            const [users, orders, orderItems] = await Promise.all([
                prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, image: true } }),
                prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, total: true, status: true } }),
                prisma.orderItem.findMany({ where: { orderId: { in: orderIds } } })
            ]);

            const productIds = [...new Set(orderItems.map(i => i.productId).filter(Boolean))];
            const products = productIds.length
                ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, images: true } })
                : [];

            const userMap = new Map(users.map(u => [u.id, u]));
            const orderMap = new Map(orders.map(o => [o.id, o]));
            const productMap = new Map(products.map(p => [p.id, p]));
            const orderItemsByOrder = new Map();
            for (const item of orderItems) {
                if (!orderItemsByOrder.has(item.orderId)) orderItemsByOrder.set(item.orderId, []);
                orderItemsByOrder.get(item.orderId).push({ ...item, product: productMap.get(item.productId) || null });
            }

            returns = rawReturns.map(r => {
                const order = orderMap.get(r.orderId);
                return {
                    ...r,
                    user: userMap.get(r.userId) || null,
                    order: order ? { ...order, orderItems: orderItemsByOrder.get(order.id) || [] } : null
                };
            });
        }

        return NextResponse.json({ returns, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
