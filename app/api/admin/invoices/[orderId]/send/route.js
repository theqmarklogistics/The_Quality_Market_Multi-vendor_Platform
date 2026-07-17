import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { generateInvoice } from "@/lib/generateInvoice";
import { sendInvoiceEmail } from "@/lib/email";
import { logAdminAction } from "@/lib/auditLog";
import { createInvoiceForOrder, shippingTierLabel } from "@/lib/invoices";

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

        // Bank Transfer invoices carry a sequential number — reuse the stored
        // invoice, or issue one now for legacy orders placed before auto-invoicing.
        let invoice = await prisma.invoice.findUnique({ where: { orderId } });
        if (!invoice && order.paymentMethod === 'BANK_TRANSFER') {
            const subtotal = order.orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
            const coupon = order.coupon && typeof order.coupon === 'object' ? order.coupon : null;
            invoice = await createInvoiceForOrder({
                orderId: order.id,
                subtotal,
                shippingFee: order.shippingCost || 0,
                discount: coupon?.discount ? parseFloat(((coupon.discount / 100) * subtotal).toFixed(2)) : 0,
                total: order.total,
                chargeableKg: null,
                shippingTier: shippingTierLabel(order.deliveryType),
                snapshot: {
                    paymentMethod: order.paymentMethod,
                    coupon: coupon || {},
                    customer: { name: order.user?.name || '', email: order.user?.email || '' },
                    address: {
                        street: order.address?.street, city: order.address?.city, state: order.address?.state,
                        country: order.address?.country, phone: order.address?.phone,
                    },
                    items: order.orderItems.map(i => ({ name: i.product?.name || 'Product', quantity: i.quantity, price: i.price })),
                    bank: {
                        bankName: paymentConfig?.bankName || null,
                        bankAccountNumber: paymentConfig?.bankAccountNumber || null,
                        bankAccountName: paymentConfig?.bankAccountName || null,
                        bankBranch: paymentConfig?.bankBranch || null,
                    },
                    momo: {
                        momoAccountName: paymentConfig?.momoAccountName || null,
                        momoPayCode: paymentConfig?.momoPayCode || null,
                    },
                    ekash: {
                        ekashNumber: paymentConfig?.ekashNumber || null,
                        ekashAccountName: paymentConfig?.ekashAccountName || null,
                    },
                },
            });
        }

        const pdfBuffer = await generateInvoice({ order, paymentConfig, invoice });

        await sendInvoiceEmail({
            to: order.user.email,
            subject: invoice ? `Invoice ${invoice.paymentReference} — The Quality Market` : undefined,
            filename: invoice ? `${invoice.paymentReference}.pdf` : undefined,
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
