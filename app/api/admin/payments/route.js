import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { logAdminAction } from "@/lib/auditLog";
import { dispatchExpressOrder } from "@/lib/expressDispatch";

const ALLOWED_REVIEW_STATUSES = ["APPROVED", "REJECTED"];

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
        const proofStatus = searchParams.get('proofStatus') || 'SUBMITTED';

        const where = { paymentProofStatus: proofStatus };

        const [rawOrders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.order.count({ where })
        ]);

        // Hydrate users, stores, orderItems, products separately (no include)
        let orders = rawOrders;
        if (rawOrders.length) {
            const orderIds = rawOrders.map(o => o.id);
            const userIds = [...new Set(rawOrders.map(o => o.userId).filter(Boolean))];
            const storeIds = [...new Set(rawOrders.map(o => o.storeId).filter(Boolean))];

            const [orderItems, users, stores] = await Promise.all([
                prisma.orderItem.findMany({ where: { orderId: { in: orderIds } } }),
                prisma.user.findMany({ where: { id: { in: userIds } } }),
                prisma.store.findMany({ where: { id: { in: storeIds } } })
            ]);

            const productIds = [...new Set(orderItems.map(i => i.productId).filter(Boolean))];
            const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } } }) : [];

            const productMap = new Map(products.map(p => [p.id, p]));
            const userMap = new Map(users.map(u => [u.id, u]));
            const storeMap = new Map(stores.map(s => [s.id, s]));
            const orderItemsByOrder = new Map();
            for (const item of orderItems) {
                if (!orderItemsByOrder.has(item.orderId)) orderItemsByOrder.set(item.orderId, []);
                orderItemsByOrder.get(item.orderId).push({ ...item, product: productMap.get(item.productId) || null });
            }

            orders = rawOrders.map(o => ({
                ...o,
                user: userMap.get(o.userId) || null,
                store: storeMap.get(o.storeId) || null,
                orderItems: orderItemsByOrder.get(o.id) || []
            }));
        }

        return NextResponse.json({ orders, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orderId, status, notes } = await request.json();

        if (!orderId || !status) {
            return NextResponse.json({ error: "Missing review details" }, { status: 400 });
        }

        if (!ALLOWED_REVIEW_STATUSES.includes(status)) {
            return NextResponse.json({ error: "Invalid review status" }, { status: 400 });
        }

        // Payment may only be marked received after reviewing an actually submitted
        // proof — never approve an order that has no proof on file.
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { paymentProofUrl: true, paymentProofStatus: true, deliveryType: true }
        });
        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }
        if (status === "APPROVED" && (!order.paymentProofUrl || order.paymentProofStatus !== "SUBMITTED")) {
            return NextResponse.json(
                { error: "A submitted payment proof must be reviewed before marking this payment as received." },
                { status: 400 }
            );
        }

        await prisma.order.update({
            where: { id: orderId },
            data: {
                paymentProofStatus: status,
                paymentProofNotes: notes || null,
                paymentReviewedBy: userId,
                paymentReviewedAt: new Date(),
                paymentStatus: status === "APPROVED" ? "PAID" : "PENDING",
                isPaid: status === "APPROVED",
                paymentReceivedAt: status === "APPROVED" ? new Date() : null
            }
        });

        // EXPRESS orders dispatch the moment their payment is confirmed —
        // a single-stop run appears on the dispatch board immediately
        // (idempotent: skipped if the order was already dispatched).
        if (status === "APPROVED" && order.deliveryType === "EXPRESS") {
            dispatchExpressOrder(orderId).catch(console.error);
        }

        try {
            await inngest.send({
                name: "payment/proof.reviewed",
                data: {
                    orderId,
                    status,
                    reviewedBy: userId
                }
            });
        } catch (inngestError) {
            console.error("Inngest payment review event error:", inngestError.message);
        }

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: `PAYMENT_${status}`, targetType: 'Order', targetId: orderId, notes });

        return NextResponse.json({ message: `Payment proof ${status.toLowerCase()} successfully` });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
