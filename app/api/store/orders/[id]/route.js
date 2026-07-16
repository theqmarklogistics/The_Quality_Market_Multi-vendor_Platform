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

        // ── Set pooled delivery intake method ─────────────────────────────────
        if (body.intakeMethod !== undefined) {
            const validMethods = ['HUB_DROP_OFF', 'DRIVER_SWEEP'];
            if (!validMethods.includes(body.intakeMethod)) {
                return NextResponse.json({ error: "Invalid intake method" }, { status: 400 });
            }
            if (!['KIGALI_POOL', 'EXPRESS'].includes(order.deliveryType)) {
                return NextResponse.json({ error: "Intake method only applies to rider-delivered (pooled/express) orders" }, { status: 400 });
            }

            let newTotal = order.total;
            let newShippingCost = order.shippingCost ?? 0;
            // Add driver sweep fee only once — if switching to DRIVER_SWEEP and not already set
            if (body.intakeMethod === 'DRIVER_SWEEP' && order.intakeMethod !== 'DRIVER_SWEEP') {
                newShippingCost = parseFloat((newShippingCost + 1000).toFixed(2));
                newTotal = parseFloat((newTotal + 1000).toFixed(2));
            }
            // Remove previously-added sweep fee if switching back to hub drop-off
            if (body.intakeMethod === 'HUB_DROP_OFF' && order.intakeMethod === 'DRIVER_SWEEP') {
                newShippingCost = parseFloat((newShippingCost - 1000).toFixed(2));
                newTotal = parseFloat((newTotal - 1000).toFixed(2));
            }

            await prisma.$executeRaw`
                UPDATE "Order"
                SET "intakeMethod" = ${body.intakeMethod}::"IntakeMethod",
                    "shippingCost" = ${newShippingCost},
                    total = ${newTotal},
                    "updatedAt" = NOW()
                WHERE id = ${orderId} AND "storeId" = ${storeId}
            `;
            return NextResponse.json({ message: `Intake method set to ${body.intakeMethod}`, total: newTotal, shippingCost: newShippingCost });
        }

        // ── Set shipping fee (LOCAL_SELLER) ────────────────────────────────────
        if (body.shippingCost !== undefined) {
            const fee = parseFloat(body.shippingCost);
            if (isNaN(fee) || fee < 0) {
                return NextResponse.json({ error: "Invalid shipping fee" }, { status: 400 });
            }
            // Delivery fees are platform-calculated (segmented taper + weight-range
            // formula) for every delivery type — sellers cannot add their own fee.
            if (order.deliveryType !== 'KIGALI_POOL' && fee > 0) {
                return NextResponse.json({ error: "Delivery fees are calculated by the platform — a manual shipping fee cannot be added to this order." }, { status: 400 });
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
