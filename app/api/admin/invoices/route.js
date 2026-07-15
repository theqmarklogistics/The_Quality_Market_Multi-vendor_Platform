import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const rawOrders = await prisma.order.findMany({
            where: { invoiceRequested: true },
            orderBy: { invoiceRequestedAt: 'desc' },
        });

        // Hydrate users + stored invoices separately (no include — avoids driverAdapters transaction)
        const userIds = [...new Set(rawOrders.map(o => o.userId).filter(Boolean))];
        const orderIds = rawOrders.map(o => o.id);
        const [users, invoices] = await Promise.all([
            userIds.length
                ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
                : [],
            orderIds.length
                ? prisma.invoice.findMany({
                    where: { orderId: { in: orderIds } },
                    select: { orderId: true, invoiceNumber: true, paymentReference: true, issuedAt: true, total: true },
                })
                : [],
        ]);
        const userMap = new Map(users.map(u => [u.id, u]));
        const invoiceMap = new Map(invoices.map(i => [i.orderId, i]));
        const orders = rawOrders.map(o => ({
            ...o,
            user: userMap.get(o.userId) || null,
            invoice: invoiceMap.get(o.id) || null,
        }));

        return NextResponse.json({ orders });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
