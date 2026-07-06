import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

// Get dashboard data for admin (total orders, total sales, total products,
// total stores, total revenue). The 90-day revenue timeline used to be a
// `findMany` of every order row in the window — O(rows) memory and a heavy
// payload. Replaced with a single Postgres `GROUP BY date_trunc` that returns
// one bucket per day.
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET(request) {

    try {
        const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);

    if(!isAdmin) {
        return NextResponse.json({error: "Not Unauthorized"}, {status: 401});
    }

    const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);

    const [
        orders,
        newOrders,
        stores,
        pendingStores,
        dailyRevenueRaw,
        revenueAgg,
        products,
        pendingProducts,
        pendingPaymentProofs,
        unreadChatMessages,
        pendingInvoiceRequests,
    ] = await Promise.all([
        prisma.order.count(),
        prisma.order.count({
            where: {
                status: 'ORDER_PLACED'
            }
        }),
        prisma.store.count(),
        prisma.store.count({
            where: {
                status: 'pending'
            }
        }),
        // 90-day aggregate — one row per day instead of one row per order.
        // Returns: [{ day: Date, total: number, count: bigint }]
        prisma.$queryRaw`
            SELECT date_trunc('day', "createdAt") AS day,
                   COALESCE(SUM("total"), 0)     AS total,
                   COUNT(*)                       AS count
            FROM "Order"
            WHERE "createdAt" >= ${ninetyDaysAgo}
            GROUP BY day
            ORDER BY day ASC
        `,
        prisma.order.aggregate({
            _sum: {
                total: true
            }
        }),
        prisma.product.count(),
        prisma.product.count({
            where: {
                approvalStatus: 'PENDING'
            }
        }),
        prisma.order.count({
            where: {
                paymentProofStatus: 'SUBMITTED'
            }
        }),
        prisma.message.count({
            where: {
                isRead: false,
                senderId: { not: userId },
                conversation: { participants: { some: { userId } } }
            }
        }),
        prisma.order.count({
            where: { invoiceRequested: true, invoiceStatus: null }
        })
    ]);

    const revenue = Number(revenueAgg?._sum?.total || 0).toFixed(2);

    // Convert raw bigint/decimal types into JSON-friendly numbers.
    const dailyRevenue = dailyRevenueRaw.map(row => ({
        day: row.day,
        total: Number(row.total),
        count: Number(row.count)
    }));

    const dashboardData = {
        orders,
        newOrders,
        stores,
        pendingStores,
        revenue,
        products,
        pendingProducts,
        pendingPaymentProofs,
        unreadChatMessages,
        pendingInvoiceRequests,
        // Kept the original `allOrders` key for backwards compatibility with
        // the existing admin UI, but the shape is now daily buckets.
        allOrdersDaily: dailyRevenue
    }

    return NextResponse.json(dashboardData);
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }


}
