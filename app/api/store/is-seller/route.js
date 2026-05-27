import prisma from "@/lib/prisma";
import { getAuth, clerkClient } from "@clerk/nextjs/server";
import authSeller from "@/middlewares/authSeller";
import { NextResponse } from "next/server";

// Auto-upsert user from Clerk if the Inngest webhook missed creating them.
// This is a silent fix so the seller dashboard works even after a sync failure.
async function ensureUser(userId) {
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (existing) return;
    try {
        const client = await clerkClient();
        const clerkUser = await client.users.getUser(userId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? '';
        const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || 'User';
        await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: {
                id: userId,
                name,
                email,
                image: clerkUser.imageUrl ?? '',
                cart: {}
            }
        });
    } catch (e) {
        console.error('ensureUser failed:', e.message);
        // Non-fatal — authSeller will surface user_not_found if this failed
    }
}

// Auth seller
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ isSeller: false, reason: 'unauthenticated' }, { status: 401 });
        }

        // Ensure the user record exists before delegating to authSeller
        await ensureUser(userId);

        const result = await authSeller(userId);

        // authSeller returns a storeId string when approved; objects when not
        if (typeof result !== 'string') {
            const reason = result?.reason || 'unauthorized';
            return NextResponse.json({ isSeller: false, reason }, { status: 401 });
        }

        const storeInfo = await prisma.store.findFirst({
            where: { userId }
        });

        return NextResponse.json({ isSeller: true, storeInfo });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
