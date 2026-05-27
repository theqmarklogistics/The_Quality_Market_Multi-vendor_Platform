//Update seller order status
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authSeller from "@/middlewares/authSeller";
import prisma from "@/lib/prisma";


export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const storeId = await authSeller(userId);

        if(!storeId){
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        return NextResponse.json({ error: "Only admin can update order delivery status" }, { status: 403 });
        
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// Get all orders for a seller (paginated)
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const storeId = await authSeller(userId);

        if(!storeId){
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
        const status = searchParams.get('status') || '';
        const search = searchParams.get('search')?.trim() || '';

        const where = { storeId }
        if (status) where.status = status
        if (search) where.user = { name: { contains: search, mode: 'insensitive' } }

        const [rawOrders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.order.count({ where })
        ]);

        // Hydrate orderItems, products, users, addresses separately (no include)
        let orders = rawOrders;
        if (rawOrders.length) {
            const orderIds = rawOrders.map(o => o.id);
            const userIds = [...new Set(rawOrders.map(o => o.userId).filter(Boolean))];
            const addressIds = [...new Set(rawOrders.map(o => o.addressId).filter(Boolean))];

            const [orderItems, users, addresses] = await Promise.all([
                prisma.orderItem.findMany({ where: { orderId: { in: orderIds } } }),
                prisma.user.findMany({ where: { id: { in: userIds } } }),
                prisma.address.findMany({ where: { id: { in: addressIds } } })
            ]);

            const productIds = [...new Set(orderItems.map(i => i.productId).filter(Boolean))];
            const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } } }) : [];

            const productMap = new Map(products.map(p => [p.id, p]));
            const userMap = new Map(users.map(u => [u.id, u]));
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
                address: addressMap.get(o.addressId) || null
            }));
        }

        return NextResponse.json({ orders, total, page, pages: Math.ceil(total / limit) }, { status: 200 });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}