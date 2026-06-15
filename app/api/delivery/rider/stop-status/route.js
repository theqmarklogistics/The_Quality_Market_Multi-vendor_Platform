import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authRider from "@/middlewares/authRider";
import authAdmin from "@/middlewares/authAdmin";
import { emitDelivery } from "@/lib/deliveryRealtime";
import { notifyDeliveryEvent } from "@/lib/deliveryNotifications";

// Statuses a rider may set per stop (DELIVERED is handled by /verify-otp).
const ALLOWED = new Set(["ARRIVING", "FAILED"]);

// POST { orderId, status, failureReason? } — rider updates a single stop's status.
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authRider(userId))) {
            return NextResponse.json({ error: "Forbidden — riders only" }, { status: 403 });
        }

        const { orderId, status, failureReason } = await request.json();
        if (!orderId || !status) {
            return NextResponse.json({ error: "orderId and status are required" }, { status: 400 });
        }
        if (!ALLOWED.has(status)) {
            return NextResponse.json({ error: `status must be one of: ${[...ALLOWED].join(", ")}` }, { status: 400 });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                corridor: { select: { id: true, assignedRiderId: true } },
                address: { select: { email: true, phone: true } },
            },
        });
        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        if (order.deliveryType !== "KIGALI_POOL") {
            return NextResponse.json({ error: "Not a pooled-delivery order" }, { status: 400 });
        }

        // Only the rider assigned to the order's corridor (or admin) may update it.
        const isAssigned = order.corridor?.assignedRiderId === userId;
        if (!isAssigned && !(await authAdmin(userId))) {
            return NextResponse.json({ error: "This stop is not on your route" }, { status: 403 });
        }
        if (order.deliveryStatus === "DELIVERED") {
            return NextResponse.json({ error: "Order already delivered" }, { status: 409 });
        }

        const resolvedReason = failureReason || "Delivery attempt failed";
        await prisma.order.update({
            where: { id: orderId },
            data: {
                deliveryStatus: status,
                ...(status === "FAILED"
                    ? { failureReason: resolvedReason, deliveryAttempts: { increment: 1 } }
                    : {}),
            },
        });

        const payload = {
            orderId,
            deliveryStatus: status,
            failureReason: status === "FAILED" ? resolvedReason : null,
            at: new Date().toISOString(),
        };
        emitDelivery(
            [`track-${orderId}`, order.corridor?.id ? `corridor-${order.corridor.id}` : null, "logistics-room"],
            "delivery-status-update",
            payload
        );

        // Notify the customer (best-effort): "arriving" and "failed" are both high-signal.
        await notifyDeliveryEvent({ ...order, failureReason: resolvedReason }, status);

        return NextResponse.json({ success: true, ...payload });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
