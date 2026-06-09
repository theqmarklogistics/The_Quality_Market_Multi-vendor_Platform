import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";

// GET ?date=YYYY-MM-DD — all corridors running that day, with stops + assigned rider.
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get("date");
        const dayStart = dateParam ? new Date(dateParam) : new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const corridors = await prisma.deliveryCorridor.findMany({
            where: { runDate: { gte: dayStart, lte: dayEnd } },
            orderBy: { name: "asc" },
            include: {
                assignedRider: { select: { id: true, name: true, riderProfile: { select: { phone: true, vehicleType: true } } } },
                orders: {
                    orderBy: { stopSequence: "asc" },
                    include: { address: true, store: { select: { name: true } } },
                },
            },
        });

        const result = corridors.map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            runDate: c.runDate,
            dispatchedAt: c.dispatchedAt,
            completedAt: c.completedAt,
            riderLat: c.riderLat,
            riderLng: c.riderLng,
            riderLocationAt: c.riderLocationAt,
            rider: c.assignedRider
                ? { id: c.assignedRider.id, name: c.assignedRider.name, phone: c.assignedRider.riderProfile?.phone ?? null }
                : null,
            stops: c.orders.map((o) => ({
                orderId: o.id,
                stopSequence: o.stopSequence,
                deliveryStatus: o.deliveryStatus,
                intakeMethod: o.intakeMethod,
                storeName: o.store?.name ?? null,
                recipientName: o.address?.name ?? null,
                recipientPhone: o.address?.phone ?? null,
                sector: o.address?.sector ?? null,
                landmarkAddress: o.landmarkAddress ?? null,
                lat: o.recipientLat ?? o.address?.latitude ?? null,
                lng: o.recipientLng ?? o.address?.longitude ?? null,
                deliveryFeeShare: o.deliveryFeeShare,
            })),
        }));

        return NextResponse.json({ corridors: result });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
