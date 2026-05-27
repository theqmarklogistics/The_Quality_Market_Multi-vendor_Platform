import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { logAdminAction } from "@/lib/auditLog";

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const [rawPayouts, stores] = await Promise.all([
            prisma.payout.findMany({ orderBy: { createdAt: 'desc' } }),
            prisma.store.findMany({
                where: { isActive: true },
                select: { id: true, name: true, username: true },
            }),
        ]);

        // Hydrate payout stores separately (no include — avoids driverAdapters transaction)
        const payoutStoreIds = [...new Set(rawPayouts.map(p => p.storeId).filter(Boolean))];
        const payoutStores = payoutStoreIds.length
            ? await prisma.store.findMany({ where: { id: { in: payoutStoreIds } }, select: { id: true, name: true, username: true } })
            : [];
        const payoutStoreMap = new Map(payoutStores.map(s => [s.id, s]));
        const payouts = rawPayouts.map(p => ({ ...p, store: payoutStoreMap.get(p.storeId) || null }));

        // Calculate net earnings and unpaid balance per store
        const storeIds = stores.map(s => s.id);
        const [allOrders, paidPayoutsAgg] = await Promise.all([
            prisma.order.findMany({
                where: { storeId: { in: storeIds }, paymentStatus: 'PAID' },
                select: { storeId: true, total: true, commission: true },
            }),
            prisma.payout.groupBy({
                by: ['storeId'],
                where: { storeId: { in: storeIds }, status: 'PAID' },
                _sum: { amount: true },
            }),
        ]);

        const paidPayoutsMap = new Map(paidPayoutsAgg.map(p => [p.storeId, p._sum.amount || 0]));

        const storeSummaries = stores.map(store => {
            const orders = allOrders.filter(o => o.storeId === store.id);
            const gross = orders.reduce((acc, o) => acc + o.total, 0);
            const commissions = orders.reduce((acc, o) => {
                const items = Array.isArray(o.commission) ? o.commission : [];
                return acc + items.reduce((s, i) => s + (i.commissionAmount || 0), 0);
            }, 0);
            const netEarnings = Math.round(gross - commissions);
            const totalPaidOut = Math.round(paidPayoutsMap.get(store.id) || 0);
            return {
                ...store,
                netEarnings,
                totalPaidOut,
                unpaid: Math.max(0, netEarnings - totalPaidOut),
            };
        }).filter(s => s.netEarnings > 0);

        return NextResponse.json({ payouts, storeSummaries });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { storeId, amount, periodStart, periodEnd, notes } = await request.json();
        if (!storeId || !amount || !periodStart || !periodEnd) {
            return NextResponse.json({ error: "storeId, amount, periodStart, periodEnd are required" }, { status: 400 });
        }

        const createdPayout = await prisma.payout.create({
            data: {
                storeId,
                amount: parseFloat(amount),
                periodStart: new Date(periodStart),
                periodEnd: new Date(periodEnd),
                notes: notes?.trim() || null,
            }
        });

        // Fetch store separately (no include on create — avoids driverAdapters transaction)
        const [payoutStore, admin] = await Promise.all([
            prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
            prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
        ]);
        const payout = { ...createdPayout, store: payoutStore || null };
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: 'PAYOUT_CREATED', targetType: 'Payout', targetId: payout.id, notes: `Store: ${payoutStore?.name || storeId}, Amount: ${amount}` });

        return NextResponse.json({ message: "Payout created", payout }, { status: 201 });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
