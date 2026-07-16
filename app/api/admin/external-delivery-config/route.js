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

// POST { basePrice?, perSector?, baseRatePerKgKm?, minimumFloor?, volumetricFactor?,
//        taperStepKm?, taperDropPerStep?, taperFloorPct? } — update delivery pricing (admin).
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const data = {};
        if (Number.isFinite(body?.basePrice) && body.basePrice >= 0) data.basePrice = body.basePrice;
        if (body?.perSector && typeof body.perSector === "object" && !Array.isArray(body.perSector)) data.perSector = body.perSector;
        if (Number.isFinite(body?.baseRatePerKgKm) && body.baseRatePerKgKm > 0) data.baseRatePerKgKm = body.baseRatePerKgKm;
        if (Number.isFinite(body?.expressBaseRatePerKgKm) && body.expressBaseRatePerKgKm > 0) data.expressBaseRatePerKgKm = body.expressBaseRatePerKgKm;
        if (Number.isFinite(body?.minimumFloor) && body.minimumFloor >= 0) data.minimumFloor = body.minimumFloor;
        if (Number.isFinite(body?.volumetricFactor) && body.volumetricFactor > 0) data.volumetricFactor = body.volumetricFactor;
        // Distance-taper knobs. Step must be positive; drop is a fraction 0–1;
        // floor is a positive fraction ≤ 1 (the rate never decays below it).
        if (Number.isFinite(body?.taperStepKm) && body.taperStepKm > 0) data.taperStepKm = body.taperStepKm;
        if (Number.isFinite(body?.taperDropPerStep) && body.taperDropPerStep >= 0 && body.taperDropPerStep <= 1) data.taperDropPerStep = body.taperDropPerStep;
        if (Number.isFinite(body?.taperFloorPct) && body.taperFloorPct > 0 && body.taperFloorPct <= 1) data.taperFloorPct = body.taperFloorPct;

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
