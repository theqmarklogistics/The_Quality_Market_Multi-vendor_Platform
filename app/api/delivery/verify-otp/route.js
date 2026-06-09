import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { triggerSplitPayout } from "@/lib/pooledDeliveryPayout";

export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orderId, inputOtp } = await request.json();

        if (!orderId || !inputOtp) {
            return NextResponse.json({ error: "orderId and inputOtp are required" }, { status: 400 });
        }

        if (!/^\d{4}$/.test(String(inputOtp))) {
            return NextResponse.json({ error: "OTP must be a 4-digit number" }, { status: 400 });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId }
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        if (order.deliveryType !== 'KIGALI_POOL') {
            return NextResponse.json({ error: "This order does not use Kigali Pooled Delivery" }, { status: 400 });
        }

        if (order.deliveryStatus === 'DELIVERED') {
            return NextResponse.json({ error: "This order has already been delivered" }, { status: 409 });
        }

        if (String(inputOtp) !== order.deliveryOtp) {
            return NextResponse.json({ error: "Invalid OTP. Please verify the code with the customer." }, { status: 401 });
        }

        // Atomically mark as delivered and release escrow
        await prisma.$executeRaw`
            UPDATE "Order"
            SET status = 'DELIVERED'::"OrderStatus",
                "deliveryStatus" = 'DELIVERED'::"PoolDeliveryStatus",
                "escrowStatus" = 'RELEASED'::"EscrowStatus",
                "updatedAt" = NOW()
            WHERE id = ${orderId} AND "deliveryOtp" = ${order.deliveryOtp}
        `;

        // Trigger split payout (mock MoMo disbursements)
        const payout = await triggerSplitPayout(order);

        return NextResponse.json({
            success: true,
            message: "Delivery confirmed. Escrow released.",
            payout
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
