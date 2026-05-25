import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authSeller from "@/middlewares/authSeller";
import prisma from "@/lib/prisma";

const SELLER_ALLOWED_STATUSES = ["PROCESSING", "SHIPPED"];

export async function PATCH(request, { params }) {
    try {
        const { userId } = getAuth(request);
        const storeId = await authSeller(userId);

        if (!storeId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: orderId } = await params;
        const { status } = await request.json();

        if (!orderId || !status) {
            return NextResponse.json({ error: "Missing order ID or status" }, { status: 400 });
        }

        if (!SELLER_ALLOWED_STATUSES.includes(status)) {
            return NextResponse.json({ error: `Sellers can only set status to: ${SELLER_ALLOWED_STATUSES.join(', ')}` }, { status: 403 });
        }

        const order = await prisma.order.findFirst({
            where: { id: orderId, storeId }
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        await prisma.order.update({
            where: { id: orderId },
            data: { status }
        });

        return NextResponse.json({ message: `Order marked as ${status.toLowerCase()}` });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
