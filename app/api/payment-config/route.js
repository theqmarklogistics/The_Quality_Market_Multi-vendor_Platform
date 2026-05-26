import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Public endpoint — returns MoMo details only (bank details kept private, sent via invoice)
export async function GET() {
    try {
        const config = await prisma.paymentConfig.findUnique({ where: { id: 'default' } });
        return NextResponse.json({
            momoPayCode: config?.momoPayCode || null,
            momoAccountName: config?.momoAccountName || null,
            momoConfigured: !!(config?.momoPayCode && config?.momoAccountName),
            bankConfigured: !!(config?.bankName && config?.bankAccountNumber),
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ momoPayCode: null, momoAccountName: null, momoConfigured: false, bankConfigured: false });
    }
}
