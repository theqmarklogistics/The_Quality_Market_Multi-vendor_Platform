import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { emitDelivery } from "@/lib/deliveryRealtime";

// POST { lat, lng } — the customer opts in to share their live location so the rider
// can find them. Persists on the order (not the saved address) and pushes the pin to
// the rider/corridor + logistics rooms.
export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { orderId } = await params;
        if (!orderId) return NextResponse.json({ error: "Missing order ID" }, { status: 400 });

        const { lat, lng } = await request.json();
        if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
            return NextResponse.json({ error: "lat and lng (numbers) are required" }, { status: 400 });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { userId: true, deliveryType: true, corridorId: true },
        });
        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        if (order.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        if (order.deliveryType !== "KIGALI_POOL") {
            return NextResponse.json({ error: "Not a pooled-delivery order" }, { status: 400 });
        }

        const now = new Date();
        await prisma.order.update({
            where: { id: orderId },
            data: { recipientLat: lat, recipientLng: lng, locationSharedAt: now },
        });

        emitDelivery(
            [order.corridorId ? `corridor-${order.corridorId}` : null, "logistics-room"],
            "customer-location-update",
            { orderId, lat, lng, at: now.toISOString() }
        );

        return NextResponse.json({ success: true, at: now.toISOString() });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
