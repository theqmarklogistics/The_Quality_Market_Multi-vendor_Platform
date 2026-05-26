import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSocketServer } from "@/lib/socketServer";

export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id: orderId } = await params;

        const order = await prisma.order.findFirst({
            where: { id: orderId, userId },
            select: { id: true, paymentStatus: true, invoiceStatus: true, invoiceRequested: true },
        });

        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        if (order.paymentStatus !== 'PENDING') return NextResponse.json({ error: 'Invoice can only be requested for pending orders' }, { status: 400 });
        if (order.invoiceStatus === 'SENT') return NextResponse.json({ error: 'Invoice has already been sent to your email' }, { status: 400 });

        await prisma.order.update({
            where: { id: orderId },
            data: { invoiceRequested: true, invoiceRequestedAt: new Date() },
        });

        try {
            const io = getSocketServer();
            io.to('admin-room').emit('admin-notification', {
                key: 'invoiceRequest',
                orderId,
                message: 'A customer has requested a payment invoice',
            });
        } catch (socketError) {
            console.error('Socket notify error:', socketError.message);
        }

        return NextResponse.json({ message: 'Invoice request submitted. The admin will send it to your email shortly.' });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
