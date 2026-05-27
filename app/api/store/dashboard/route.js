import {NextResponse} from "next/server";
import {getAuth} from "@clerk/nextjs/server";
import authSeller from "@/middlewares/authSeller";
import prisma from "@/lib/prisma";


// Get Dashboard data for a seller (total orders, total sales, total products, total earnings)
export async function GET(request) {
    try {
        const {userId} = getAuth(request);
        const storeId = await authSeller(userId);

        if(!storeId){
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }

        const [orders, productCount, ratings, lowStockProducts] = await Promise.all([
            prisma.order.findMany({
                where: { storeId },
                select: { total: true, paymentStatus: true, commission: true }
            }),
            prisma.product.count({ where: { storeId } }),
            prisma.rating.findMany({
                where: { product: { storeId } },
                orderBy: { createdAt: 'desc' },
                take: 20
            }),
            prisma.product.findMany({
                where: { storeId, warehouseQuantity: { lte: 5 }, approvalStatus: 'APPROVED' },
                select: { id: true, name: true, warehouseQuantity: true, inStock: true },
                orderBy: { warehouseQuantity: 'asc' },
                take: 10,
            })
        ]);

        // Hydrate ratings with user + product (no include — avoids driverAdapters transaction)
        const ratingUserIds = [...new Set(ratings.map(r => r.userId).filter(Boolean))];
        const ratingProductIds = [...new Set(ratings.map(r => r.productId).filter(Boolean))];
        const [ratingUsers, ratingProducts] = await Promise.all([
            ratingUserIds.length
                ? prisma.user.findMany({ where: { id: { in: ratingUserIds } }, select: { id: true, name: true, image: true } })
                : [],
            ratingProductIds.length
                ? prisma.product.findMany({ where: { id: { in: ratingProductIds } }, select: { id: true, name: true } })
                : []
        ]);
        const ratingUserMap = new Map(ratingUsers.map(u => [u.id, u]));
        const ratingProductMap = new Map(ratingProducts.map(p => [p.id, p]));
        const hydratedRatings = ratings.map(r => ({
            ...r,
            user: ratingUserMap.get(r.userId) || null,
            product: ratingProductMap.get(r.productId) || null
        }));

        const paidOrders = orders.filter(o => o.paymentStatus === 'PAID');
        const grossEarnings = paidOrders.reduce((acc, o) => acc + o.total, 0);
        const totalCommissions = paidOrders.reduce((acc, o) => {
            const items = Array.isArray(o.commission) ? o.commission : [];
            return acc + items.reduce((sum, item) => sum + (item.commissionAmount || 0), 0);
        }, 0);

        const dashboardData = {
            totalOrders: orders.length,
            totalProducts: productCount,
            totalEarnings: Math.round(grossEarnings - totalCommissions),
            ratings: hydratedRatings,
            lowStockProducts,
        };

        return NextResponse.json(dashboardData); 
        
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }
}