import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import { STAFF_RECEIVER_ROLES } from "@/lib/constants";

// GET — internal staff who can be recorded as having received a package
// (the "Received by" dropdown on external deliveries). Active company staff only.
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const staff = await prisma.user.findMany({
            where: { role: { in: STAFF_RECEIVER_ROLES }, isActive: true },
            orderBy: { name: "asc" },
            select: { id: true, name: true, role: true },
        });

        return NextResponse.json({ staff });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
