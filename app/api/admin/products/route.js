import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { getSocketServer } from "@/lib/socketServer";
import { logAdminAction } from "@/lib/auditLog";

const ALLOWED_STATUSES = ["APPROVED", "REJECTED"];

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status") || "PENDING";

        const products = await prisma.product.findMany({
            where: {
                approvalStatus: status
            },
            include: {
                store: true
            },
            orderBy: {
                createdAt: "asc"
            }
        });

        return NextResponse.json({ products });
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

        const { productId, status, notes } = await request.json();

        if (!productId || !status) {
            return NextResponse.json({ error: "Missing moderation details" }, { status: 400 });
        }

        if (!ALLOWED_STATUSES.includes(status)) {
            return NextResponse.json({ error: "Invalid moderation status" }, { status: 400 });
        }

        const updatedProduct = await prisma.product.update({
            where: { id: productId },
            data: {
                approvalStatus: status,
                approvalNotes: notes || null,
                approvedBy: status === "APPROVED" ? userId : null,
                approvedAt: status === "APPROVED" ? new Date() : null
            },
            select: {
                id: true,
                name: true,
                storeId: true
            }
        });

        try {
            const io = getSocketServer();
            io.to(`store-room-${updatedProduct.storeId}`).emit('store-notification', {
                key: 'productModeration',
                productId: updatedProduct.id,
                status,
                message: `Your product \"${updatedProduct.name}\" was ${status.toLowerCase()} by admin.`
            });
        } catch (socketError) {
            console.error('Socket.IO store notify error:', socketError.message);
        }

        try {
            await inngest.send({
                name: "product/moderation.updated",
                data: {
                    productId,
                    status,
                    moderatedBy: userId
                }
            });
        } catch (inngestError) {
            console.error("Inngest product moderation event error:", inngestError.message);
        }

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: `PRODUCT_${status}`, targetType: 'Product', targetId: productId, notes });

        return NextResponse.json({ message: `Product ${status.toLowerCase()} successfully` });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
