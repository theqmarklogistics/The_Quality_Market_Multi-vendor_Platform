import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

function parseRangeDays(value) {
    if (!value || value === "all") return null;
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return 30;
    return Math.min(parsed, 3650);
}

function startOfUtcDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { productId } = await params;
        const { searchParams } = new URL(request.url);
        const rangeDays = parseRangeDays(searchParams.get("days") || "30");
        const since = rangeDays ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000) : null;

        const product = await prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                name: true,
                description: true,
                mrp: true,
                price: true,
                warehouseQuantity: true,
                images: true,
                category: true,
                storeId: true,
                approvalStatus: true,
                approvedAt: true,
                createdAt: true,
            }
        });

        if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

        const [ratingAgg, orderItems, recentOrders] = await Promise.all([
            prisma.rating.aggregate({ where: { productId }, _avg: { rating: true }, _count: { id: true } }),
            prisma.orderItem.findMany({
                where: {
                    productId,
                    ...(since ? { order: { createdAt: { gte: since } } } : {}),
                },
                select: { orderId: true, quantity: true, price: true, order: { select: { createdAt: true } } },
            }),
            prisma.order.findMany({
                where: { orderItems: { some: { productId } } },
                orderBy: { createdAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    total: true,
                    status: true,
                    isPaid: true,
                    createdAt: true,
                    user: { select: { name: true, email: true } },
                    orderItems: { select: { productId: true, quantity: true, price: true } }
                }
            })
        ]);

        // Build metrics
        let unitsSold = 0;
        let revenue = 0;
        const orderIds = new Set();
        const trendMap = new Map();

        for (const item of orderItems) {
            const q = Number(item.quantity) || 0;
            const p = Number(item.price) || 0;
            unitsSold += q;
            revenue += q * p;
            orderIds.add(item.orderId);

            if (item.order?.createdAt) {
                const day = startOfUtcDay(new Date(item.order.createdAt)).toISOString().slice(0, 10);
                const entry = trendMap.get(day) || { date: day, revenue: 0, unitsSold: 0, orders: new Set() };
                entry.revenue += q * p;
                entry.unitsSold += q;
                entry.orders.add(item.orderId);
                trendMap.set(day, entry);
            }
        }

        const trend = [...trendMap.values()].map(e => ({ date: e.date, revenue: Number(e.revenue.toFixed(2)), unitsSold: e.unitsSold, orders: e.orders.size })).sort((a,b)=>a.date.localeCompare(b.date));

        const averageRating = Number((ratingAgg._avg.rating || 0).toFixed(1));
        const reviewCount = ratingAgg._count.id || 0;

        return NextResponse.json({
            product: {
                ...product,
                unitsSold,
                revenue: Number(revenue.toFixed(2)),
                orderCount: orderIds.size,
                averageRating,
                reviewCount,
                approvalAgeDays: product.approvedAt ? Math.max(0, Math.floor((Date.now() - new Date(product.approvedAt).getTime()) / (24*60*60*1000))) : null,
                firstSaleAt: orderItems.length ? orderItems.map(i => i.order?.createdAt).filter(Boolean).sort()[0] : null,
                lastSaleAt: orderItems.length ? orderItems.map(i => i.order?.createdAt).filter(Boolean).sort().reverse()[0] : null,
            },
            trend,
            recentOrders
        });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 500 });
    }
}
