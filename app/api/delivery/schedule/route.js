import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET — the PUBLIC rider departure schedule: which corridors run from which hub,
// on which weekday, at what time. No auth: senders use this to know when to drop
// packages at a hub. Rider names are shown as first name only.
export async function GET() {
    try {
        const hubs = await prisma.deliveryHub.findMany({
            where: { isActive: true },
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                sector: true,
                landmark: true,
                corridorRoutes: {
                    where: { isActive: true },
                    orderBy: { name: "asc" },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        areas: true,
                        schedules: {
                            where: { isActive: true },
                            orderBy: [{ dayOfWeek: "asc" }, { departTime: "asc" }],
                            select: {
                                id: true,
                                dayOfWeek: true,
                                departTime: true,
                                rider: { select: { name: true } },
                            },
                        },
                    },
                },
            },
        });

        const result = hubs.map((hub) => ({
            ...hub,
            corridorRoutes: hub.corridorRoutes.map((c) => ({
                ...c,
                schedules: c.schedules.map((s) => ({
                    id: s.id,
                    dayOfWeek: s.dayOfWeek,
                    departTime: s.departTime,
                    // Public page: first name only.
                    riderName: s.rider?.name ? s.rider.name.split(" ")[0] : null,
                })),
            })),
        }));

        return NextResponse.json(
            { hubs: result },
            { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
        );
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
