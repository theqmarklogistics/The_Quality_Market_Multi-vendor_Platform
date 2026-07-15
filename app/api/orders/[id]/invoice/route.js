import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateInvoice } from "@/lib/generateInvoice";
import { orderViewFromInvoice, paymentConfigFromInvoice } from "@/lib/invoices";

// GET — download the stored invoice PDF for one of the caller's orders.
// Rendered from the invoice's frozen snapshot so the document never drifts
// after issue, even if the order or payment config changes later.
export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id: orderId } = await params;

        const order = await prisma.order.findFirst({
            where: { id: orderId, userId },
            select: { id: true },
        });
        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

        const invoice = await prisma.invoice.findUnique({ where: { orderId } });
        if (!invoice) return NextResponse.json({ error: "No invoice has been issued for this order yet" }, { status: 404 });

        const pdfBuffer = await generateInvoice({
            order: orderViewFromInvoice(invoice),
            paymentConfig: paymentConfigFromInvoice(invoice),
            invoice,
        });

        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${invoice.paymentReference}.pdf"`,
            },
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
