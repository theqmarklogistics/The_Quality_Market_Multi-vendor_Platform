import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSocketServer } from "@/lib/socketServer";
import { generateInvoice } from "@/lib/generateInvoice";
import { sendInvoiceEmail } from "@/lib/email";
import { orderViewFromInvoice, paymentConfigFromInvoice } from "@/lib/invoices";

export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id: orderId } = await params;

        // Fetch full order details — needed for both auto-send (MoMo) and admin-queue (Bank)
        const [order, paymentConfig] = await Promise.all([
            prisma.order.findFirst({
                where: { id: orderId, userId },
                include: {
                    orderItems: { include: { product: { select: { name: true, images: true } } } },
                    user: { select: { name: true, email: true } },
                    address: true,
                },
            }),
            prisma.paymentConfig.findUnique({ where: { id: 'default' } }),
        ]);

        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        if (order.paymentStatus !== 'PENDING') return NextResponse.json({ error: 'Invoice can only be requested for pending orders' }, { status: 400 });
        if (order.invoiceStatus === 'SENT') return NextResponse.json({ error: 'Invoice has already been sent to your email' }, { status: 400 });

        const isMomo = order.paymentMethod === 'MTN_MOMO';
        const isEkash = order.paymentMethod === 'EKASH';

        if (isMomo || isEkash) {
            // MTN MoMo / eKash: self-service payment details, so generate and send
            // the invoice immediately — no admin approval needed. The PDF renders
            // the matching (MoMo or eKash) payment instructions from paymentConfig.
            if (!order.user?.email) return NextResponse.json({ error: 'No email on file for this account' }, { status: 400 });

            const pdfBuffer = await generateInvoice({ order, paymentConfig });
            await sendInvoiceEmail({ to: order.user.email, orderId: order.id, pdfBuffer });

            await prisma.$executeRaw`
                UPDATE "Order"
                SET "invoiceRequested" = true,
                    "invoiceRequestedAt" = NOW(),
                    "invoiceStatus" = 'SENT',
                    "invoiceSentAt" = NOW(),
                    "updatedAt" = NOW()
                WHERE id = ${orderId}
            `;

            return NextResponse.json({ message: 'Invoice sent to your email!' });
        }

        // Bank Transfer: invoices are auto-issued at order placement — re-send the
        // stored one when it exists (renders from its frozen snapshot).
        const storedInvoice = await prisma.invoice.findUnique({ where: { orderId } });
        if (storedInvoice) {
            if (!order.user?.email) return NextResponse.json({ error: 'No email on file for this account' }, { status: 400 });

            const pdfBuffer = await generateInvoice({
                order: orderViewFromInvoice(storedInvoice),
                paymentConfig: paymentConfigFromInvoice(storedInvoice),
                invoice: storedInvoice,
            });
            await sendInvoiceEmail({
                to: order.user.email,
                subject: `Invoice ${storedInvoice.paymentReference} — The Quality Market`,
                filename: `${storedInvoice.paymentReference}.pdf`,
                orderId,
                pdfBuffer,
            });

            await prisma.$executeRaw`
                UPDATE "Order"
                SET "invoiceRequested" = true,
                    "invoiceRequestedAt" = NOW(),
                    "invoiceStatus" = 'SENT',
                    "invoiceSentAt" = NOW(),
                    "updatedAt" = NOW()
                WHERE id = ${orderId}
            `;

            return NextResponse.json({ message: 'Invoice sent to your email!' });
        }

        // Legacy Bank Transfer orders (placed before auto-invoicing): queue for admin review.
        await prisma.$executeRaw`
            UPDATE "Order"
            SET "invoiceRequested" = true,
                "invoiceRequestedAt" = NOW(),
                "updatedAt" = NOW()
            WHERE id = ${orderId}
        `;

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
