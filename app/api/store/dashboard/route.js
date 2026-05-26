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
                include: {
                    user: { select: { name: true, image: true } },
                    product: { select: { name: true } }
                },
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
            ratings,
            lowStockProducts,
        };

        return NextResponse.json(dashboardData); 
        
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }
}