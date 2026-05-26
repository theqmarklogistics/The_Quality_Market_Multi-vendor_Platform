import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { logAdminAction } from "@/lib/auditLog";

const ALLOWED_ORDER_STATUSES = ["ORDER_PLACED", "PROCESSING", "SHIPPED", "DELIVERED"];

const VALID_TRANSITIONS = {
    ORDER_PLACED: ['PROCESSING'],
    PROCESSING:   ['SHIPPED'],
    SHIPPED:      ['DELIVERED'],
    DELIVERED:    [],
};

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
        const status = searchParams.get('status') || '';
        const search = searchParams.get('search')?.trim() || '';

        const where = {};
        if (status) where.status = status;
        if (search) where.user = { name: { contains: search, mode: 'insensitive' } };

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    orderItems: { include: { product: true } },
                    user: true,
                    store: true,
                    address: true
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.order.count({ where })
        ]);

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

        const { orderId, status } = await request.json();

        if (!orderId || !status) {
            return NextResponse.json({ error: "Missing order update details" }, { status: 400 });
        }

        if (!ALLOWED_ORDER_STATUSES.includes(status)) {
            return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
        }

        const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const allowed = VALID_TRANSITIONS[order.status] || [];
        if (!allowed.includes(status)) {
            return NextResponse.json({
                error: `Cannot transition from ${order.status} to ${status}. Expected: ${allowed.join(', ') || 'none'}`
            }, { status: 400 });
        }

        await prisma.order.update({ where: { id: orderId }, data: { status } });

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: 'ORDER_STATUS_UPDATED', targetType: 'Order', targetId: orderId, notes: `${order.status} → ${status}` });

        return NextResponse.json({ message: "Order status updated successfully" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
