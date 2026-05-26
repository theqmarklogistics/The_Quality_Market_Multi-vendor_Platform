import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { getSocketServer } from "@/lib/socketServer";
import { logAdminAction } from "@/lib/auditLog";

const ALLOWED = ['APPROVED', 'REJECTED'];

export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { ids, action, notes } = await request.json();

        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "No product IDs provided" }, { status: 400 });
        }
        if (!ALLOWED.includes(action)) {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        const { count } = await prisma.product.updateMany({
            where: { id: { in: ids }, approvalStatus: 'PENDING' },
            data: {
                approvalStatus: action,
                approvalNotes: action === 'REJECTED' ? (notes?.trim() || null) : null,
                approvedBy: action === 'APPROVED' ? userId : null,
                approvedAt: action === 'APPROVED' ? new Date() : null,
            }
        });

        // Notify each affected store via socket
        try {
            const products = await prisma.product.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true, storeId: true }
            });
            const io = getSocketServer();
            for (const p of products) {
                io.to(`store-room-${p.storeId}`).emit('store-notification', {
                    key: 'productModeration',
                    productId: p.id,
                    status: action,
                    message: `Your product "${p.name}" was ${action.toLowerCase()} by admin.`
                });
            }
        } catch (socketError) {
            console.error('Socket notify error:', socketError.message);
        }

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: `PRODUCT_BULK_${action}`, targetType: 'Product', targetId: ids.join(','), notes: `${count} products. ${notes || ''}`.trim() });

        return NextResponse.json({ message: `${count} product${count !== 1 ? 's' : ''} ${action.toLowerCase()}`, count });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
