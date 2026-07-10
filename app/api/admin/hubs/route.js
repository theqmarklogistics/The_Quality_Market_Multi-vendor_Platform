import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";
import { logAdminAction } from "@/lib/auditLog";

// GET — all hubs with their registered corridors (admin management view).
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const hubs = await prisma.deliveryHub.findMany({
            orderBy: { createdAt: "asc" },
            include: {
                corridorRoutes: {
                    orderBy: { name: "asc" },
                    include: {
                        schedules: {
                            orderBy: [{ dayOfWeek: "asc" }, { departTime: "asc" }],
                            include: { rider: { select: { id: true, name: true } } },
                        },
                    },
                },
            },
        });

        return NextResponse.json({ hubs });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// POST { name, sector?, landmark?, latitude?, longitude? } — register a new hub.
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const name = (body?.name || "").trim();
        if (!name) return NextResponse.json({ error: "Hub name is required" }, { status: 400 });

        const num = (v) => (Number.isFinite(v) ? v : null);
        const hub = await prisma.deliveryHub.create({
            data: {
                name,
                sector: (body?.sector || "").trim() || null,
                landmark: (body?.landmark || "").trim() || null,
                latitude: num(body?.latitude),
                longitude: num(body?.longitude),
            },
        });

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || "", action: "HUB_CREATED", targetType: "DeliveryHub", targetId: hub.id, notes: name });

        return NextResponse.json({ hub, message: "Hub created" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
