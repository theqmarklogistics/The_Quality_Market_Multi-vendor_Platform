import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import { dispatchExpressOrder } from "@/lib/expressDispatch";

// POST — logistics/admin records that an EXTERNAL delivery has been paid for
// (cash/transfer collected at booking). Self-serve partners instead upload a
// payment proof that an admin approves. Only paid external jobs can be routed.
export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const { id } = await params;
        const order = await prisma.order.findUnique({
            where: { id },
            select: { isExternalDelivery: true, isPaid: true, deliveryType: true },
        });
        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        if (!order.isExternalDelivery) {
            return NextResponse.json({ error: "Only external deliveries can be marked paid here" }, { status: 400 });
        }

        await prisma.order.update({
            where: { id },
            data: {
                isPaid: true,
                paymentStatus: "PAID",
                paymentProofStatus: "APPROVED",
                paymentReviewedBy: userId,
                paymentReviewedAt: new Date(),
                paymentReceivedAt: new Date(),
            },
        });

        // EXPRESS bookings dispatch the moment they're paid (idempotent).
        if (order.deliveryType === "EXPRESS") {
            dispatchExpressOrder(id).catch(console.error);
        }

        return NextResponse.json({ success: true, orderId: id, isPaid: true });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
