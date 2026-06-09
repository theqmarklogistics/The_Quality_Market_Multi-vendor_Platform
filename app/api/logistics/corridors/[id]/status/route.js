import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import { emitDelivery } from "@/lib/deliveryRealtime";

// POST { action } — drive a corridor through its dispatch lifecycle.
//   dispatch → IN_TRANSIT (requires assigned rider; flips its orders to IN_TRANSIT)
//   complete → COMPLETED
//   close    → CLOSED
//   open     → OPEN
export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const { id } = await params;
        const { action } = await request.json();

        const corridor = await prisma.deliveryCorridor.findUnique({
            where: { id },
            include: { orders: { select: { id: true } } },
        });
        if (!corridor) return NextResponse.json({ error: "Corridor not found" }, { status: 404 });

        let corridorData = {};
        let newOrderStatus = null;

        switch (action) {
            case "dispatch":
                if (!corridor.assignedRiderId) {
                    return NextResponse.json({ error: "Assign a rider before dispatching" }, { status: 400 });
                }
                corridorData = { status: "IN_TRANSIT", dispatchedAt: new Date() };
                newOrderStatus = "IN_TRANSIT";
                break;
            case "complete":
                corridorData = { status: "COMPLETED", completedAt: new Date() };
                break;
            case "close":
                corridorData = { status: "CLOSED" };
                break;
            case "open":
                corridorData = { status: "OPEN" };
                break;
            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        await prisma.deliveryCorridor.update({ where: { id }, data: corridorData });

        if (newOrderStatus) {
            // Only advance orders still en route to the hub, not ones already delivered/failed.
            await prisma.order.updateMany({
                where: { corridorId: id, deliveryStatus: { in: ["PENDING_INTAKE", "SORTING"] } },
                data: { deliveryStatus: newOrderStatus },
            });
        }

        const rooms = [`corridor-${id}`, "logistics-room", ...corridor.orders.map((o) => `track-${o.id}`)];
        emitDelivery(rooms, "corridor-update", { corridorId: id, status: corridorData.status, orderStatus: newOrderStatus });
        if (newOrderStatus) {
            corridor.orders.forEach((o) =>
                emitDelivery([`track-${o.id}`], "delivery-status-update", { orderId: o.id, deliveryStatus: newOrderStatus })
            );
        }

        return NextResponse.json({ success: true, corridorId: id, status: corridorData.status });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
