import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

// PATCH { name?, description?, areas?, isActive? } — update a registered corridor.
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
        if (typeof body?.description === "string") data.description = body.description.trim() || null;
        if (typeof body?.isActive === "boolean") data.isActive = body.isActive;
        if (body?.areas !== undefined) {
            data.areas = Array.isArray(body.areas)
                ? body.areas.map((a) => String(a).trim()).filter(Boolean)
                : String(body.areas || "").split(",").map((a) => a.trim()).filter(Boolean);
        }

        const corridor = await prisma.corridorRoute.update({ where: { id }, data });
        return NextResponse.json({ corridor, message: "Corridor updated" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// DELETE — remove a registered corridor (cascades to its schedule entries).
export async function DELETE(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        await prisma.corridorRoute.delete({ where: { id } });
        return NextResponse.json({ message: "Corridor deleted" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
