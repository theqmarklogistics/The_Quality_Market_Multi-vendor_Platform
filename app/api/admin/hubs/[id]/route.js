import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

// PATCH { name?, sector?, landmark?, latitude?, longitude?, isActive? } — update a hub.
export async function PATCH(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const data = {};
        if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
        if (typeof body?.sector === "string") data.sector = body.sector.trim() || null;
        if (typeof body?.landmark === "string") data.landmark = body.landmark.trim() || null;
        if (Number.isFinite(body?.latitude)) data.latitude = body.latitude;
        if (Number.isFinite(body?.longitude)) data.longitude = body.longitude;
        if (typeof body?.isActive === "boolean") data.isActive = body.isActive;

        const hub = await prisma.deliveryHub.update({ where: { id }, data });
        return NextResponse.json({ hub, message: "Hub updated" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// DELETE — remove a hub (cascades to its corridors + schedules).
export async function DELETE(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        await prisma.deliveryHub.delete({ where: { id } });
        return NextResponse.json({ message: "Hub deleted" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
