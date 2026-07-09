import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";

// GET — un-corridored Kigali pooled orders that can be loaded onto a scheduled
// route. These are pooled orders awaiting intake/sorting that no corridor has
// claimed yet (the same pool the auto-batcher draws from).
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const orders = await prisma.order.findMany({
            where: {
                deliveryType: "KIGALI_POOL",
                corridorId: null,
                deliveryStatus: { in: ["PENDING_INTAKE", "SORTING"] },
                // Unpaid external (off-platform) deliveries are surfaced too, but
                // flagged `paymentPending` below — the hub can accept/sort them,
                // yet the batching engine independently refuses to route them
                // until they're paid.
            },
            orderBy: { createdAt: "asc" },
            take: 100,
            include: {
                address: { select: { name: true, sector: true, district: true, phone: true } },
                store: { select: { name: true } },
            },
        });

        return NextResponse.json({
            orders: orders.map((o) => ({
                orderId: o.id,
                deliveryStatus: o.deliveryStatus,
                intakeMethod: o.intakeMethod,
                createdAt: o.createdAt,
                storeName: o.store?.name ?? null,
                recipientName: o.address?.name ?? null,
                recipientPhone: o.address?.phone ?? null,
                sector: o.address?.sector ?? o.address?.district ?? null,
                landmarkAddress: o.landmarkAddress ?? null,
                isExternalDelivery: o.isExternalDelivery,
                packageDescription: o.packageDescription ?? null,
                // Unpaid external bookings can be intaken but not routed yet.
                paymentPending: o.isExternalDelivery && !o.isPaid,
            })),
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
