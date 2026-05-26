import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const { reason } = await request.json();

        if (!reason?.trim()) {
            return NextResponse.json({ error: "Return reason is required" }, { status: 400 });
        }

        const order = await prisma.order.findFirst({
            where: { id, userId },
            include: { returnRequest: true }
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        if (order.status !== 'DELIVERED') {
            return NextResponse.json({ error: "Only delivered orders can be returned" }, { status: 400 });
        }

        if (order.returnRequest) {
            return NextResponse.json({ error: "A return request already exists for this order" }, { status: 400 });
        }

        const returnRequest = await prisma.return.create({
            data: { orderId: id, userId, reason: reason.trim() }
        });

        return NextResponse.json({ message: "Return request submitted", returnRequest }, { status: 201 });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to submit return request" }, { status: 500 });
    }
}
