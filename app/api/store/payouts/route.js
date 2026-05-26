import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import authSeller from "@/middlewares/authSeller";
import prisma from "@/lib/prisma";

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const storeId = await authSeller(userId);
        if (!storeId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const payouts = await prisma.payout.findMany({
            where: { storeId },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ payouts });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
