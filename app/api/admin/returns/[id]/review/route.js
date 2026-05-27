import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { logAdminAction } from "@/lib/auditLog";

const ALLOWED = ['APPROVED', 'REJECTED', 'COMPLETED'];

export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const { status, adminNotes } = await request.json();

        if (!ALLOWED.includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const returnRequest = await prisma.return.findUnique({ where: { id } });
        if (!returnRequest) {
            return NextResponse.json({ error: "Return request not found" }, { status: 404 });
        }

        // Move order lookup outside the transaction (batch transactions can't contain reads
        // that conditionally gate further writes — and PrismaNeonHttp requires batch form)
        let orderItemsToRestore = [];
        if (status === 'COMPLETED') {
            const order = await prisma.order.findUnique({
                where: { id: returnRequest.orderId },
                include: { orderItems: true }
            });
            orderItemsToRestore = order?.orderItems ?? [];
        }

        // PrismaNeonHttp does not support $transaction in any form.
        // Update the return status first, then restore stock in parallel.
        const updated = await prisma.return.update({
            where: { id },
            data: {
                status,
                adminNotes: adminNotes?.trim() || null,
                reviewedBy: userId,
                reviewedAt: new Date(),
            }
        });

        if (orderItemsToRestore.length > 0) {
            await Promise.all(
                orderItemsToRestore.map(item => prisma.product.update({
                    where: { id: item.productId },
                    data: { warehouseQuantity: { increment: item.quantity }, inStock: true }
                }))
            );
        }

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: `RETURN_${status}`, targetType: 'Return', targetId: id, notes: adminNotes });

        return NextResponse.json({ message: `Return marked as ${status.toLowerCase()}`, return: updated });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
