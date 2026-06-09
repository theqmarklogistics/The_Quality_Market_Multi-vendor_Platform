import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";

// GET — all RIDER users (with profile) the dispatcher can assign.
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const riders = await prisma.user.findMany({
            where: { role: "RIDER" },
            select: {
                id: true,
                name: true,
                email: true,
                riderProfile: { select: { phone: true, vehicleType: true, isActive: true } },
            },
            orderBy: { name: "asc" },
        });

        return NextResponse.json({
            riders: riders.map((r) => ({
                id: r.id,
                name: r.name,
                email: r.email,
                phone: r.riderProfile?.phone ?? null,
                vehicleType: r.riderProfile?.vehicleType ?? null,
                isActive: r.riderProfile?.isActive ?? true,
            })),
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
