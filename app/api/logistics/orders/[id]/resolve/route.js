import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import { emitDelivery } from "@/lib/deliveryRealtime";

// POST { action } — resolve a FAILED pooled delivery.
//   repool → clear the corridor assignment and send the order back to the batching
//            queue (escrow stays HELD) so it joins the next route.
//   refund → release the customer from the order: escrow REFUNDED, stays FAILED.
export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const { id } = await params;
        const { action } = await request.json();

        const order = await prisma.order.findUnique({
            where: { id },
            select: { deliveryType: true, deliveryStatus: true, corridorId: true },
        });
        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        if (!["KIGALI_POOL", "EXPRESS"].includes(order.deliveryType)) {
            return NextResponse.json({ error: "Not a rider-pipeline delivery order" }, { status: 400 });
        }
        if (order.deliveryStatus !== "FAILED") {
            return NextResponse.json({ error: "Only failed deliveries can be resolved" }, { status: 409 });
        }

        let data;
        let event;
        if (action === "repool") {
            // Send back to the queue: the next batching run will place it on a fresh corridor.
            data = {
                corridorId: null,
                stopSequence: null,
                deliveryFeeShare: null,
                deliveryStatus: "PENDING_INTAKE",
                failureReason: null,
            };
            event = { orderId: id, deliveryStatus: "PENDING_INTAKE", repooled: true };
        } else if (action === "refund") {
            data = { escrowStatus: "REFUNDED" };
            event = { orderId: id, deliveryStatus: "FAILED", escrowStatus: "REFUNDED" };
        } else {
            return NextResponse.json({ error: "action must be 'repool' or 'refund'" }, { status: 400 });
        }

        await prisma.order.update({ where: { id }, data });

        emitDelivery(
            [`track-${id}`, order.corridorId ? `corridor-${order.corridorId}` : null, "logistics-room"],
            "delivery-status-update",
            event
        );

        return NextResponse.json({ success: true, ...event });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
