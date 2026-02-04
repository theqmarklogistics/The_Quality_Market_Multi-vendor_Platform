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

        // Get all orders for seller
        const totalOrders = await prisma.order.findMany({
            where: {
                storeId
            }
        });

        // Get total products with ratings for seller
        const totalProducts = await prisma.product.findMany({
            where: {
                storeId
            }
        });

        const ratings = await prisma.rating.findMany({
            where: {
                productId: {
                    in: totalProducts.map(product => product.id)
                }
            }, 
            include: {user: true, product: true}
        });

        const dashboardData = {
            totalOrders: totalOrders.length,
            totalProducts: totalProducts.length,
            totalEarnings: Math.round(totalOrders.reduce((acc, order) => acc + order.total, 0)),
            ratings
        };

        return NextResponse.json(dashboardData); 
        
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }
}