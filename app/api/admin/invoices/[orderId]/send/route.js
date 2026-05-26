import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { generateInvoice } from "@/lib/generateInvoice";
import { sendInvoiceEmail } from "@/lib/email";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { orderId } = await params;

        const [order, paymentConfig] = await Promise.all([
            prisma.order.findUnique({
                where: { id: orderId },
                include: {
                    orderItems: { include: { product: { select: { name: true, images: true } } } },
                    user: { select: { name: true, email: true } },
                    address: true,
                },
            }),
            prisma.paymentConfig.findUnique({ where: { id: 'default' } }),
        ]);

        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        if (!order.user?.email) return NextResponse.json({ error: 'Customer email not found' }, { status: 400 });

        const pdfBuffer = await generateInvoice({ order, paymentConfig });

        await sendInvoiceEmail({
            to: order.user.email,
            orderId: order.id,
            pdfBuffer,
        });

        await prisma.order.update({
            where: { id: orderId },
            data: { invoiceStatus: 'SENT', invoiceSentAt: new Date() },
        });

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: 'INVOICE_SENT', targetType: 'Order', targetId: orderId, notes: `Invoice sent to ${order.user.email}` });

        return NextResponse.json({ message: 'Invoice sent successfully' });
    } catch (error) {
        console.error('Send invoice error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
