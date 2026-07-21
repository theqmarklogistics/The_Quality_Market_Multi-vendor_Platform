import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";

// GET — active admin-registered corridors (CorridorRoute), for staff to pick from
// when scheduling a daily route. Read-only listing with just the fields the
// dispatch board needs to prefill a run (name, hub, service areas, landmarks).
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const corridors = await prisma.corridorRoute.findMany({
            where: { isActive: true },
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                description: true,
                areas: true,
                landmarks: true,
                hub: { select: { id: true, name: true } },
            },
        });

        const result = corridors.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            areas: c.areas,
            landmarks: c.landmarks,
            hubId: c.hub?.id ?? null,
            hubName: c.hub?.name ?? null,
        }));

        return NextResponse.json({ corridors: result });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
