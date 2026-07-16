import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET — the PUBLIC delivery network: every active hub (with coordinates), our
// agents stationed around the city (name, phone, location), and the logistics
// manager's contact. No auth: senders use this to find the nearest drop point
// or a person to call. Only staff whose contact card is marked public appear.
export async function GET() {
    try {
        const [hubs, staff] = await Promise.all([
            prisma.deliveryHub.findMany({
                where: { isActive: true },
                orderBy: { name: "asc" },
                select: {
                    id: true,
                    name: true,
                    sector: true,
                    landmark: true,
                    latitude: true,
                    longitude: true,
                },
            }),
            prisma.user.findMany({
                where: {
                    role: { in: ["AGENT", "LOGISTICS_MANAGER"] },
                    isActive: true,
                    staffProfile: { is: { isPublic: true } },
                },
                orderBy: { name: "asc" },
                select: {
                    id: true,
                    name: true,
                    image: true,
                    role: true,
                    staffProfile: { select: { phone: true, sector: true, landmark: true } },
                },
            }),
        ]);

        const toCard = (u) => ({
            id: u.id,
            name: u.name,
            image: u.image || null,
            phone: u.staffProfile?.phone || null,
            sector: u.staffProfile?.sector || null,
            landmark: u.staffProfile?.landmark || null,
        });

        return NextResponse.json(
            {
                hubs,
                agents: staff.filter((u) => u.role === "AGENT").map(toCard),
                managers: staff.filter((u) => u.role === "LOGISTICS_MANAGER").map(toCard),
            },
            { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
        );
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
