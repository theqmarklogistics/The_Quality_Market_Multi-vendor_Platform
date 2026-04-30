import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

const ALLOWED_ORDER_STATUSES = ["ORDER_PLACED", "PROCESSING", "SHIPPED", "DELIVERED"];

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status") || undefined;

        const where = {};
        if (status) where.status = status;

        const orders = await prisma.order.findMany({
            where,
            include: {
                orderItems: { include: { product: true } },
                user: true,
                store: true,
                address: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return NextResponse.json({ orders });
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

        await prisma.order.update({
            where: { id: orderId },
            data: { status }
        });

        return NextResponse.json({ message: "Order status updated successfully" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
