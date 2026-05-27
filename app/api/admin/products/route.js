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
        const view = searchParams.get("view");

        // ── All-products view (with pagination, status filter, name search) ──
        if (view === "all") {
            const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
            const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
            const skip = (page - 1) * pageSize;
            const statusParam = searchParams.get("status") || "";
            const nameParam = searchParams.get("name") || "";

            const where = {};
            if (statusParam) where.approvalStatus = statusParam;
            if (nameParam) where.name = { contains: nameParam, mode: "insensitive" };

            const [rawProducts, total] = await Promise.all([
                prisma.product.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip,
                    take: pageSize
                }),
                prisma.product.count({ where })
            ]);

            // Hydrate store + counts separately (no include — avoids driverAdapters transaction)
            const storeIds = [...new Set(rawProducts.map(p => p.storeId).filter(Boolean))];
            const productIds = rawProducts.map(p => p.id);
            const [stores, orderItemCounts, ratingCounts] = await Promise.all([
                storeIds.length
                    ? prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
                    : [],
                prisma.orderItem.groupBy({ by: ['productId'], where: { productId: { in: productIds } }, _count: { productId: true } }),
                prisma.rating.groupBy({ by: ['productId'], where: { productId: { in: productIds } }, _count: { productId: true } })
            ]);
            const storeMap = new Map(stores.map(s => [s.id, s]));
            const orderItemCountMap = new Map(orderItemCounts.map(a => [a.productId, a._count.productId]));
            const ratingCountMap = new Map(ratingCounts.map(a => [a.productId, a._count.productId]));
            const products = rawProducts.map(p => ({
                ...p,
                store: storeMap.get(p.storeId) || null,
                _count: { orderItems: orderItemCountMap.get(p.id) || 0, ratings: ratingCountMap.get(p.id) || 0 }
            }));

            return NextResponse.json({ products, total });
        }

        // ── Pending approval view (default) ──
        const status = searchParams.get("status") || "PENDING";

        const rawProducts = await prisma.product.findMany({
            where: { approvalStatus: status },
            orderBy: { createdAt: "asc" }
        });

        // Hydrate stores separately (no include — avoids driverAdapters transaction)
        const storeIds = [...new Set(rawProducts.map(p => p.storeId).filter(Boolean))];
        const stores = storeIds.length
            ? await prisma.store.findMany({ where: { id: { in: storeIds } } })
            : [];
        const storeMap = new Map(stores.map(s => [s.id, s]));
        const products = rawProducts.map(p => ({ ...p, store: storeMap.get(p.storeId) || null }));

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
