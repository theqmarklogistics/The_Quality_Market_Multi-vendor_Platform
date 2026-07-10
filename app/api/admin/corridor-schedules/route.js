import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

// POST { corridorRouteId, dayOfWeek, departTime, riderId? } — add a recurring
// public schedule entry (rider departs the hub along a corridor).
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const corridorRouteId = body?.corridorRouteId || null;
        const dayOfWeek = Number.parseInt(body?.dayOfWeek, 10);
        const departTime = (body?.departTime || "").trim();
        const riderId = body?.riderId || null;

        if (!corridorRouteId) return NextResponse.json({ error: "Pick a corridor" }, { status: 400 });
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
            return NextResponse.json({ error: "Pick a valid day of the week" }, { status: 400 });
        }
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(departTime)) {
            return NextResponse.json({ error: "Departure time must be HH:mm (24h)" }, { status: 400 });
        }

        const corridor = await prisma.corridorRoute.findUnique({ where: { id: corridorRouteId }, select: { id: true } });
        if (!corridor) return NextResponse.json({ error: "Corridor not found" }, { status: 400 });

        if (riderId) {
            const rider = await prisma.user.findUnique({ where: { id: riderId }, select: { role: true } });
            if (!rider || rider.role !== "RIDER") {
                return NextResponse.json({ error: "Selected user is not a rider" }, { status: 400 });
            }
        }

        const schedule = await prisma.corridorSchedule.create({
            data: { corridorRouteId, dayOfWeek, departTime, riderId },
            include: { rider: { select: { id: true, name: true } } },
        });

        return NextResponse.json({ schedule, message: "Schedule added" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
