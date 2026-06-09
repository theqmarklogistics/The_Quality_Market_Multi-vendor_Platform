import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import { emitDelivery } from "@/lib/deliveryRealtime";

// POST — hub confirms a package has arrived and been sorted (PENDING_INTAKE → SORTING).
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
            select: { deliveryType: true, deliveryStatus: true, corridorId: true },
        });
        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        if (order.deliveryType !== "KIGALI_POOL") {
            return NextResponse.json({ error: "Not a pooled-delivery order" }, { status: 400 });
        }
        if (order.deliveryStatus !== "PENDING_INTAKE") {
            return NextResponse.json({ error: `Cannot mark intake from status ${order.deliveryStatus}` }, { status: 409 });
        }

        await prisma.order.update({ where: { id }, data: { deliveryStatus: "SORTING" } });

        emitDelivery(
            [`track-${id}`, order.corridorId ? `corridor-${order.corridorId}` : null, "logistics-room"],
            "delivery-status-update",
            { orderId: id, deliveryStatus: "SORTING" }
        );

        return NextResponse.json({ success: true, orderId: id, deliveryStatus: "SORTING" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
