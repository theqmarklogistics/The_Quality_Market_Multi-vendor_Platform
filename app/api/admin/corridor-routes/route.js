import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";
import { logAdminAction } from "@/lib/auditLog";
import { invalidateCorridorRateCache } from "@/lib/externalDelivery";

// POST { name, hubId, description?, areas?, landmarks? } — register a corridor
// served from a hub. Registered corridors are the building blocks of the public
// rider schedule. `landmarks` is the ordered list of landmarks the rider passes,
// from the beginning of the route to its end (array order is the route order).
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const name = (body?.name || "").trim();
        const hubId = body?.hubId || null;
        if (!name) return NextResponse.json({ error: "Corridor name is required" }, { status: 400 });
        if (!hubId) return NextResponse.json({ error: "Pick the hub this corridor departs from" }, { status: 400 });

        const hub = await prisma.deliveryHub.findUnique({ where: { id: hubId }, select: { id: true } });
        if (!hub) return NextResponse.json({ error: "Hub not found" }, { status: 400 });

        const areas = Array.isArray(body?.areas)
            ? body.areas.map((a) => String(a).trim()).filter(Boolean)
            : String(body?.areas || "").split(",").map((a) => a.trim()).filter(Boolean);

        // Ordered route landmarks (start → end). The submitted order is preserved.
        const landmarks = Array.isArray(body?.landmarks)
            ? body.landmarks.map((l) => String(l).trim()).filter(Boolean)
            : String(body?.landmarks || "").split(",").map((l) => l.trim()).filter(Boolean);

        // Optional lane pricing: non-negative numbers, blank/null clears the rate.
        const parseRate = (v) => {
            if (v === undefined || v === null || v === "") return null;
            const n = Number(v);
            return Number.isFinite(n) && n >= 0 ? n : NaN;
        };
        const fixedRate = parseRate(body?.fixedRate);
        const perKmRate = parseRate(body?.perKmRate);
        if (Number.isNaN(fixedRate) || Number.isNaN(perKmRate)) {
            return NextResponse.json({ error: "Rates must be non-negative numbers" }, { status: 400 });
        }

        const corridor = await prisma.corridorRoute.create({
            data: {
                name,
                hubId,
                description: (body?.description || "").trim() || null,
                areas,
                landmarks,
                fixedRate,
                perKmRate,
            },
        });

        invalidateCorridorRateCache();
        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || "", action: "CORRIDOR_REGISTERED", targetType: "CorridorRoute", targetId: corridor.id, notes: name });

        return NextResponse.json({ corridor, message: "Corridor registered" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
