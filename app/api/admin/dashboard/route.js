import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

// Get dashboard data for admin (total orders, total sales, total products, total stores, total revenue)

export async function GET(request) {
    
    try {
        const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);

    if(!isAdmin) {
        return NextResponse.json({error: "Not Unauthorized"}, {status: 401});
    }

    // Get all orders
    const orders = await prisma.order.count();
    // Get all stores on app
    const stores = await prisma.store.count();

    // Get all orders including only createdAt and total & calculate total revenue
    const allOrders = await prisma.order.findMany({
        select: {
            createdAt: true,
            total: true
        }
    });

    let totalRevenue = 0;
    allOrders.forEach(order => {
        totalRevenue += order.total;
    });

    const revenue = totalRevenue.toFixed(2);

    // Total products on app
    const products = await prisma.product.count();
    const dashboardData = {
        orders,
        stores,
        revenue,
        products,
        allOrders
    }

    return NextResponse.json(dashboardData);
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }

    
}