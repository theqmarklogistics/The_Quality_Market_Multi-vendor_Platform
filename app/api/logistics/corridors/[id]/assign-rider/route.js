import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import { emitDelivery } from "@/lib/deliveryRealtime";

// POST { riderId } — assign (or reassign) a rider to a corridor. Pass riderId: null to unassign.
export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const { id } = await params;
        const { riderId } = await request.json();

        if (riderId) {
            const rider = await prisma.user.findUnique({ where: { id: riderId }, select: { role: true } });
            if (!rider || rider.role !== "RIDER") {
                return NextResponse.json({ error: "Selected user is not a rider" }, { status: 400 });
            }
        }

        const corridor = await prisma.deliveryCorridor.update({
            where: { id },
            data: { assignedRiderId: riderId || null },
            include: { assignedRider: { select: { id: true, name: true } } },
        });

        emitDelivery([`corridor-${id}`, "logistics-room"], "corridor-update", {
            corridorId: id,
            rider: corridor.assignedRider ? { id: corridor.assignedRider.id, name: corridor.assignedRider.name } : null,
        });

        return NextResponse.json({ success: true, corridorId: id, riderId: corridor.assignedRiderId });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
