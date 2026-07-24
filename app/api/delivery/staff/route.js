import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import authExternalSeller from "@/middlewares/authExternalSeller";
import authRider from "@/middlewares/authRider";
import authAgent from "@/middlewares/authAgent";
import { STAFF_RECEIVER_ROLES } from "@/lib/constants";

// GET — internal staff who can be recorded as having received a package (the
// "Received by" dropdown on every delivery booking form). Readable by anyone who
// can book a delivery: partners, riders, agents and logistics/admin. Returns
// active company staff only, with minimal fields (id, name, role).
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const allowed =
            (await authLogistics(userId)) ||
            (await authExternalSeller(userId)) ||
            (await authRider(userId)) ||
            (await authAgent(userId));
        if (!allowed) {
            return NextResponse.json({ error: "Forbidden — delivery partners, riders, agents or staff only" }, { status: 403 });
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
