import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

// GET — all RIDER users with their profile (admin view for onboarding/management).
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const riders = await prisma.user.findMany({
            where: { role: "RIDER" },
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                riderProfile: { select: { phone: true, vehicleType: true, isActive: true } },
            },
        });

        return NextResponse.json({
            riders: riders.map((r) => ({
                id: r.id,
                name: r.name,
                email: r.email,
                image: r.image,
                phone: r.riderProfile?.phone ?? "",
                vehicleType: r.riderProfile?.vehicleType ?? "",
                isActive: r.riderProfile?.isActive ?? true,
                hasProfile: !!r.riderProfile,
            })),
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// PATCH { userId, phone?, vehicleType?, isActive? } — upsert a rider's profile.
export async function PATCH(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { userId: riderId, phone, vehicleType, isActive } = await request.json();
        if (!riderId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

        const rider = await prisma.user.findUnique({ where: { id: riderId }, select: { role: true } });
        if (!rider || rider.role !== "RIDER") {
            return NextResponse.json({ error: "User is not a rider" }, { status: 400 });
        }

        const data = {};
        if (phone !== undefined) data.phone = String(phone).trim() || null;
        if (vehicleType !== undefined) data.vehicleType = String(vehicleType).trim() || null;
        if (isActive !== undefined) data.isActive = !!isActive;

        const profile = await prisma.riderProfile.upsert({
            where: { userId: riderId },
            create: { userId: riderId, ...data },
            update: data,
        });

        return NextResponse.json({
            success: true,
            profile: { phone: profile.phone, vehicleType: profile.vehicleType, isActive: profile.isActive },
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
