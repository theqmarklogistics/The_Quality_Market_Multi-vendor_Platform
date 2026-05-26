import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";

const couponLimiter = createRateLimiter({ max: 15, windowMs: 60_000 });

// verify coupon

export async function POST(request) {
    const rl = couponLimiter(`coupon:${getClientIp(request)}`);
    if (!rl.success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

    try {
        const { userId } = getAuth(request);
        const { code } = await request.json();

        const coupon = await prisma.coupon.findUnique({
            where: {
                code: code.toUpperCase(),
                expiresAt: {
                    gt: new Date()
                }
            }
        });

        if (!coupon) {
            return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
        }

        if (coupon.forNewUser) {
            const userOrders = await prisma.order.findMany({
                where: { userId }
            });
            if (userOrders.length > 0) {
                return NextResponse.json({ error: "Coupon valid for new users only" }, { status: 400 });
            }
        }

        return NextResponse.json({ coupon });
        
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}