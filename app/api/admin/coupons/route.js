import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

// Get all coupons
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Not Unauthorized" }, { status: 401 });
        }

        const coupons = await prisma.coupon.findMany({
            orderBy: { expiresAt: 'desc' },
            take: 200,
            select: {
                code: true, description: true, discount: true,
                forNewUser: true, isPublic: true, expiresAt: true,
                maxUses: true, usedCount: true, createdAt: true
            }
        });
        return NextResponse.json({ coupons });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// Add new coupon
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Not Unauthorized" }, { status: 401 });
        }

        const { coupon } = await request.json();
        coupon.code = coupon.code.toUpperCase();
        if (coupon.maxUses !== undefined && coupon.maxUses !== '' && coupon.maxUses !== null) {
            coupon.maxUses = parseInt(coupon.maxUses, 10);
        } else {
            delete coupon.maxUses;
        }

        await prisma.coupon.create({
            data: coupon
        });

        return NextResponse.json({ message: "Coupon added successfully" }, { status: 200 });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// Delete a coupon ?code=COUPON_CODE
export async function DELETE(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Not Unauthorized" }, { status: 401 });
        }

        const { searchParams } = request.nextUrl;
        const code = searchParams.get('code');

        await prisma.coupon.delete({
            where: {
                code
            }
        });

        return NextResponse.json({ message: "Coupon deleted successfully" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
