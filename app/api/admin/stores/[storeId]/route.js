import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { logAdminAction } from "@/lib/auditLog";

export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { storeId } = await params;

        const store = await prisma.store.findUnique({
            where: { id: storeId },
            include: { user: { select: { name: true, email: true, image: true } } }
        });

        if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

        // Run all aggregations in parallel
        const [
            orderAgg,
            ordersByStatus,
            paidOrders,
            pendingPaymentProofs,
            allCommissions,
            productsByStatus,
            storeProductIds,
            recentOrders
        ] = await Promise.all([
            prisma.order.aggregate({
                where: { storeId },
                _sum: { total: true },
                _count: { id: true }
            }),
            prisma.order.groupBy({
                by: ["status"],
                where: { storeId },
                _count: { id: true }
            }),
            prisma.order.count({ where: { storeId, isPaid: true } }),
            prisma.order.count({ where: { storeId, paymentProofStatus: "SUBMITTED" } }),
            prisma.order.findMany({
                where: { storeId },
                select: { commission: true }
            }),
            prisma.product.groupBy({
                by: ["approvalStatus"],
                where: { storeId },
                _count: { id: true }
            }),
            prisma.product.findMany({
                where: { storeId },
                select: { id: true }
            }),
            prisma.order.findMany({
                where: { storeId },
                orderBy: { createdAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    total: true,
                    status: true,
                    isPaid: true,
                    paymentStatus: true,
                    createdAt: true,
                    user: { select: { name: true, email: true } },
                    orderItems: {
                        select: {
                            quantity: true,
                            price: true,
                            product: { select: { name: true } }
                        }
                    }
                }
            })
        ]);

        // Build status breakdown map
        const statusMap = { ORDER_PLACED: 0, PROCESSING: 0, SHIPPED: 0, DELIVERED: 0 };
        for (const row of ordersByStatus) {
            if (row.status in statusMap) statusMap[row.status] = row._count.id;
        }

        // Sum platform commission from JSON field
        let totalCommission = 0;
        for (const order of allCommissions) {
            const items = Array.isArray(order.commission) ? order.commission : [];
            for (const item of items) {
                totalCommission += Number(item.commissionAmount) || 0;
            }
        }
        totalCommission = parseFloat(totalCommission.toFixed(2));

        // Build product status breakdown
        const productStatusMap = { APPROVED: 0, PENDING: 0, REJECTED: 0 };
        for (const row of productsByStatus) {
            if (row.approvalStatus in productStatusMap) productStatusMap[row.approvalStatus] = row._count.id;
        }

        // Rating aggregation across all store products
        const productIds = storeProductIds.map(p => p.id);
        let avgRating = 0;
        let totalRatings = 0;
        if (productIds.length > 0) {
            const ratingAgg = await prisma.rating.aggregate({
                where: { productId: { in: productIds } },
                _avg: { rating: true },
                _count: { id: true }
            });
            avgRating = parseFloat((ratingAgg._avg.rating || 0).toFixed(1));
            totalRatings = ratingAgg._count.id;
        }

        return NextResponse.json({
            store,
            metrics: {
                totalRevenue: parseFloat((orderAgg._sum.total || 0).toFixed(2)),
                totalOrders: orderAgg._count.id,
                ordersByStatus: statusMap,
                paidOrders,
                pendingPaymentProofs,
                totalCommission,
                totalProducts: productIds.length,
                productsByStatus: productStatusMap,
                avgRating,
                totalRatings
            },
            recentOrders
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { storeId } = await params;
        const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, status: true, name: true } });
        if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
        if (String(store.status).toLowerCase() !== 'rejected') {
            return NextResponse.json({ error: "Only rejected stores can be archived" }, { status: 400 });
        }

        await prisma.store.update({
            where: { id: storeId },
            data: { status: 'archived', isActive: false, archivedAt: new Date() }
        });

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({
            adminId: userId,
            adminName: admin?.name || '',
            action: 'STORE_ARCHIVED',
            targetType: 'Store',
            targetId: storeId,
            notes: `Archived rejected store: ${store.name}`
        });

        return NextResponse.json({ message: 'Store archived successfully' });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}