import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authRider from "@/middlewares/authRider";
import { emitDelivery } from "@/lib/deliveryRealtime";

// POST { lat, lng } — rider broadcasts current GPS. Persists a last-known snapshot
// on the corridor (for late-joiners) and fans the live tick out to the corridor room,
// each customer's track room, and the logistics board. Client throttles to ~10s.
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authRider(userId))) {
            return NextResponse.json({ error: "Forbidden — riders only" }, { status: 403 });
        }

        const { lat, lng } = await request.json();
        if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
            return NextResponse.json({ error: "lat and lng (numbers) are required" }, { status: 400 });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const corridor = await prisma.deliveryCorridor.findFirst({
            where: {
                assignedRiderId: userId,
                runDate: { gte: today },
                status: "IN_TRANSIT",
            },
            include: { orders: { select: { id: true } } },
        });

        if (!corridor) {
            return NextResponse.json({ error: "No active (dispatched) corridor for this rider" }, { status: 404 });
        }

        const now = new Date();
        await prisma.deliveryCorridor.update({
            where: { id: corridor.id },
            data: { riderLat: lat, riderLng: lng, riderLocationAt: now },
        });

        const payload = { corridorId: corridor.id, lat, lng, at: now.toISOString() };
        const rooms = [
            `corridor-${corridor.id}`,
            "logistics-room",
            ...corridor.orders.map((o) => `track-${o.id}`),
        ];
        emitDelivery(rooms, "rider-location-update", payload);

        return NextResponse.json({ success: true, at: payload.at });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
