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

    const [
        orders,
        newOrders,
        stores,
        pendingStores,
        allOrders,
        revenueAgg,
        products,
        pendingProducts,
        pendingPaymentProofs,
        unreadChatMessages
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
        prisma.order.findMany({
            where: {
                createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
            },
            select: {
                createdAt: true,
                total: true
            }
        }),
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
                senderId: {
                    not: userId
                },
                conversation: {
                    participants: {
                        some: {
                            userId
                        }
                    }
                }
            }
        })
    ]);

    const revenue = Number(revenueAgg?._sum?.total || 0).toFixed(2);

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
        allOrders
    }

    return NextResponse.json(dashboardData);
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }

    
}