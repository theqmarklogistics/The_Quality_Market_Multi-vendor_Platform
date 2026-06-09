import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import { emitDelivery } from "@/lib/deliveryRealtime";

// POST { orderIds: [] } — set the stop order along the corridor (index 1..N).
export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const { id } = await params;
        const { orderIds } = await request.json();
        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return NextResponse.json({ error: "orderIds array is required" }, { status: 400 });
        }

        // Ensure every order actually belongs to this corridor.
        const owned = await prisma.order.findMany({
            where: { id: { in: orderIds }, corridorId: id },
            select: { id: true },
        });
        if (owned.length !== orderIds.length) {
            return NextResponse.json({ error: "Some orders are not on this corridor" }, { status: 400 });
        }

        for (let i = 0; i < orderIds.length; i++) {
            await prisma.order.update({ where: { id: orderIds[i] }, data: { stopSequence: i + 1 } });
        }

        emitDelivery([`corridor-${id}`, "logistics-room"], "corridor-update", { corridorId: id, reordered: true });

        return NextResponse.json({ success: true, corridorId: id });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
