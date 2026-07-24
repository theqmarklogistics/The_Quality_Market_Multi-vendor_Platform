import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import { resolveReceivedBy } from "@/lib/receivedBy";

// POST { receivedById } — record (or clear) which staff member received the
// package for an external delivery. Optional field; an empty id clears it.
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
            select: { isExternalDelivery: true },
        });
        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        if (!order.isExternalDelivery) {
            return NextResponse.json({ error: "Only external deliveries record a receiver here" }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));
        const received = await resolveReceivedBy(body?.receivedById);

        await prisma.order.update({ where: { id }, data: received });

        return NextResponse.json({ success: true, orderId: id, ...received });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: error.status || 400 });
    }
}
