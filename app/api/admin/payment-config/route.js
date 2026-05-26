import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { logAdminAction } from "@/lib/auditLog";

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const config = await prisma.paymentConfig.findUnique({ where: { id: 'default' } });
        return NextResponse.json({ config: config || {} });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { momoPayCode, momoAccountName, bankName, bankAccountNumber, bankAccountName, bankBranch } = body;

        const config = await prisma.paymentConfig.upsert({
            where: { id: 'default' },
            update: {
                momoPayCode: momoPayCode?.trim() || null,
                momoAccountName: momoAccountName?.trim() || null,
                bankName: bankName?.trim() || null,
                bankAccountNumber: bankAccountNumber?.trim() || null,
                bankAccountName: bankAccountName?.trim() || null,
                bankBranch: bankBranch?.trim() || null,
            },
            create: {
                id: 'default',
                momoPayCode: momoPayCode?.trim() || null,
                momoAccountName: momoAccountName?.trim() || null,
                bankName: bankName?.trim() || null,
                bankAccountNumber: bankAccountNumber?.trim() || null,
                bankAccountName: bankAccountName?.trim() || null,
                bankBranch: bankBranch?.trim() || null,
            },
        });

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: 'PAYMENT_CONFIG_UPDATED', targetType: 'PaymentConfig', targetId: 'default' });

        return NextResponse.json({ config });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
