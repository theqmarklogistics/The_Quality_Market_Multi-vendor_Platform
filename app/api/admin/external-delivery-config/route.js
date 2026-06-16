import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { getExternalDeliveryConfig } from "@/lib/externalDelivery";

// GET — current external-delivery pricing (admin).
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const config = await getExternalDeliveryConfig();
        return NextResponse.json({ config });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// POST { basePrice, perSector } — update external-delivery pricing (admin).
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const data = {};
        if (Number.isFinite(body?.basePrice) && body.basePrice >= 0) data.basePrice = body.basePrice;
        if (body?.perSector && typeof body.perSector === "object" && !Array.isArray(body.perSector)) data.perSector = body.perSector;

        if (!Object.keys(data).length) {
            return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        }

        await getExternalDeliveryConfig(); // ensure the row exists
        const config = await prisma.externalDeliveryConfig.update({ where: { id: "default" }, data });
        return NextResponse.json({ success: true, config });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
