import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orderId } = await params;

        if (!orderId) {
            return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { address: true, store: { select: { name: true, logo: true } } }
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        // Only the customer who placed the order can see the OTP
        if (order.userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (order.deliveryType !== 'KIGALI_POOL') {
            return NextResponse.json({ error: "This order does not use Kigali Pooled Delivery" }, { status: 400 });
        }

        return NextResponse.json({
            orderId: order.id,
            deliveryStatus: order.deliveryStatus,
            escrowStatus: order.escrowStatus,
            intakeMethod: order.intakeMethod,
            landmarkAddress: order.landmarkAddress,
            deliveryOtp: order.deliveryOtp,
            deliveryFeeShare: order.deliveryFeeShare,
            corridorId: order.corridorId,
            store: order.store,
            address: {
                name: order.address?.name,
                street: order.address?.street,
                sector: order.address?.sector,
                city: order.address?.city,
            },
            createdAt: order.createdAt,
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
