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

        // Validate the rider up front, and keep id+name for the realtime payload below.
        let assignedRider = null;
        if (riderId) {
            const rider = await prisma.user.findUnique({ where: { id: riderId }, select: { id: true, name: true, role: true } });
            if (!rider || rider.role !== "RIDER") {
                return NextResponse.json({ error: "Selected user is not a rider" }, { status: 400 });
            }
            assignedRider = { id: rider.id, name: rider.name };
        }

        // Capture the prior rider so we can notify them if they're being unassigned.
        const previous = await prisma.deliveryCorridor.findUnique({
            where: { id },
            select: { assignedRiderId: true },
        });

        // Plain update — no `include`. Keeps the write to a single statement; the
        // assigned rider is re-read separately below rather than via a relation include.
        await prisma.deliveryCorridor.update({
            where: { id },
            data: { assignedRiderId: riderId || null },
        });

        // Refresh the dispatch board, the corridor watchers, and the affected
        // rider consoles (both the newly-assigned and any replaced rider).
        const rooms = [`corridor-${id}`, "logistics-room"];
        if (riderId) rooms.push(`rider-${riderId}`);
        if (previous?.assignedRiderId && previous.assignedRiderId !== riderId) rooms.push(`rider-${previous.assignedRiderId}`);
        emitDelivery(rooms, "corridor-update", {
            corridorId: id,
            rider: assignedRider,
        });

        return NextResponse.json({ success: true, corridorId: id, riderId: riderId || null });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
