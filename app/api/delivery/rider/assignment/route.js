import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authRider from "@/middlewares/authRider";

// GET — the current rider's active corridor for today, with ordered stops.
// Never returns deliveryOtp: the rider types in the code the customer shows them.
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authRider(userId))) {
            return NextResponse.json({ error: "Forbidden — riders only" }, { status: 403 });
        }

        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        // The rider's active route: one scheduled to run today, plus any corridor
        // already in transit (covers a run that spills past midnight). Routes
        // scheduled for a future date stay hidden until their run date arrives.
        const corridor = await prisma.deliveryCorridor.findFirst({
            where: {
                assignedRiderId: userId,
                status: { in: ["CLOSED", "IN_TRANSIT"] },
                OR: [
                    { runDate: { gte: dayStart, lte: dayEnd } },
                    { status: "IN_TRANSIT" },
                ],
            },
            orderBy: { runDate: "desc" },
            include: {
                orders: {
                    orderBy: { stopSequence: "asc" },
                    include: {
                        address: true,
                        store: { select: { name: true } },
                    },
                },
            },
        });

        if (!corridor) {
            return NextResponse.json({ corridor: null, stops: [] });
        }

        const stops = corridor.orders.map((o) => ({
            orderId: o.id,
            stopSequence: o.stopSequence,
            deliveryStatus: o.deliveryStatus,
            storeName: o.store?.name || null,
            recipientName: o.address?.name || null,
            recipientPhone: o.address?.phone || null,
            street: o.address?.street || null,
            sector: o.address?.sector || null,
            city: o.address?.city || null,
            landmarkAddress: o.landmarkAddress || null,
            // Pinned/live customer location for navigation; falls back to saved address geo.
            lat: o.recipientLat ?? o.address?.latitude ?? null,
            lng: o.recipientLng ?? o.address?.longitude ?? null,
            deliveryFeeShare: o.deliveryFeeShare,
        }));

        return NextResponse.json({
            corridor: {
                id: corridor.id,
                name: corridor.name,
                status: corridor.status,
                runDate: corridor.runDate,
                dispatchedAt: corridor.dispatchedAt,
                riderLat: corridor.riderLat,
                riderLng: corridor.riderLng,
                riderLocationAt: corridor.riderLocationAt,
            },
            stops,
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
