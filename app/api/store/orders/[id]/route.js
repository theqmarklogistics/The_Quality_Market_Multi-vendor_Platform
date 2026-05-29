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
        const body = await request.json();

        if (!orderId) {
            return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
        }

        const order = await prisma.order.findFirst({
            where: { id: orderId, storeId }
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        // ── Set shipping fee (LOCAL_SELLER) ────────────────────────────────────
        if (body.shippingCost !== undefined) {
            const fee = parseFloat(body.shippingCost);
            if (isNaN(fee) || fee < 0) {
                return NextResponse.json({ error: "Invalid shipping fee" }, { status: 400 });
            }
            const oldFee = order.shippingCost ?? 0;
            const newTotal = parseFloat((order.total - oldFee + fee).toFixed(2));
            await prisma.order.update({
                where: { id: orderId },
                data: { shippingCost: fee, shippingQuoted: true, total: newTotal }
            });
            return NextResponse.json({ message: "Shipping fee set", shippingCost: fee, total: newTotal });
        }

        // ── Update order status ────────────────────────────────────────────────
        const { status } = body;

        if (!status) {
            return NextResponse.json({ error: "Missing status or shippingCost in request body" }, { status: 400 });
        }

        if (!SELLER_ALLOWED_STATUSES.includes(status)) {
            return NextResponse.json({ error: `Sellers can only set status to: ${SELLER_ALLOWED_STATUSES.join(', ')}` }, { status: 403 });
        }

        const updateData = { status };
        if (body.publicStatusNote !== undefined) {
            updateData.publicStatusNote = body.publicStatusNote?.trim() || null;
        }

        await prisma.order.update({
            where: { id: orderId },
            data: updateData
        });

        return NextResponse.json({ message: `Order marked as ${status.toLowerCase()}` });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
