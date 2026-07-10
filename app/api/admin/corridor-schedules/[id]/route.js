import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

// PATCH { dayOfWeek?, departTime?, riderId?, isActive? } — update a schedule entry.
export async function PATCH(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const data = {};
        if (body?.dayOfWeek !== undefined) {
            const d = Number.parseInt(body.dayOfWeek, 10);
            if (!Number.isInteger(d) || d < 0 || d > 6) {
                return NextResponse.json({ error: "Invalid day of week" }, { status: 400 });
            }
            data.dayOfWeek = d;
        }
        if (typeof body?.departTime === "string") {
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.departTime.trim())) {
                return NextResponse.json({ error: "Departure time must be HH:mm (24h)" }, { status: 400 });
            }
            data.departTime = body.departTime.trim();
        }
        if (body?.riderId !== undefined) data.riderId = body.riderId || null;
        if (typeof body?.isActive === "boolean") data.isActive = body.isActive;

        const schedule = await prisma.corridorSchedule.update({
            where: { id },
            data,
            include: { rider: { select: { id: true, name: true } } },
        });
        return NextResponse.json({ schedule, message: "Schedule updated" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// DELETE — remove a schedule entry.
export async function DELETE(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        await prisma.corridorSchedule.delete({ where: { id } });
        return NextResponse.json({ message: "Schedule removed" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
