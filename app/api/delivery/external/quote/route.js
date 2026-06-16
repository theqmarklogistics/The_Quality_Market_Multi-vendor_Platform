import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import authExternalSeller from "@/middlewares/authExternalSeller";
import { quoteExternalDeliveryFee } from "@/lib/externalDelivery";

// GET ?sector=<KigaliSector> — published delivery fee for a recipient sector.
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authExternalSeller(userId))) {
            return NextResponse.json({ error: "Forbidden — delivery partners only" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const sector = searchParams.get("sector") || "";
        const fee = await quoteExternalDeliveryFee(sector);
        return NextResponse.json({ fee });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
