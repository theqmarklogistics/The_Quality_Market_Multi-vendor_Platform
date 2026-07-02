import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        const order = await prisma.order.findFirst({
            where: { id, userId },
            include: { orderItems: true }
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        if (order.paymentStatus !== 'PENDING') {
            return NextResponse.json(
                { error: "Only unpaid orders can be cancelled" },
                { status: 400 }
            );
        }

        // Restore stock first (in parallel), then cancel the order.
        // If the order update fails after stock is restored, the order remains PENDING
        // and admin can correct it — better than cancelling without restoring stock.
        await Promise.all(
            order.orderItems.map(item => prisma.product.update({
                where: { id: item.productId },
                data: { warehouseQuantity: { increment: item.quantity }, inStock: true }
            }))
        );

        await prisma.order.update({
            where: { id },
            data: { paymentStatus: 'CANCELLED' }
        });

        return NextResponse.json({ message: "Order cancelled successfully" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to cancel order" }, { status: 500 });
    }
}
