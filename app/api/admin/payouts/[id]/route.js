import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { logAdminAction } from "@/lib/auditLog";

export async function PATCH(request, { params }) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const { notes } = await request.json().catch(() => ({}));

        const updatedPayout = await prisma.payout.update({
            where: { id },
            data: { status: 'PAID', paidAt: new Date(), paidBy: userId, notes: notes?.trim() || undefined }
        });

        // Fetch store separately (no include on update — avoids driverAdapters transaction)
        const [payoutStore, admin] = await Promise.all([
            prisma.store.findUnique({ where: { id: updatedPayout.storeId }, select: { name: true } }),
            prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
        ]);
        const payout = { ...updatedPayout, store: payoutStore || null };
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: 'PAYOUT_MARKED_PAID', targetType: 'Payout', targetId: id, notes: `Store: ${payoutStore?.name || updatedPayout.storeId}` });

        return NextResponse.json({ message: "Payout marked as paid", payout });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
