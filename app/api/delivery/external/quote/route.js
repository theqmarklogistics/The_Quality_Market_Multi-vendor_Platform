import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import authExternalSeller from "@/middlewares/authExternalSeller";
import authLogistics from "@/middlewares/authLogistics";
import { quoteExternalDeliveryFee } from "@/lib/externalDelivery";

// GET — live delivery quote. Params: sector, weightKg, lengthCm, widthCm, heightCm,
// dropLat, dropLng (or distanceKm). Returns { fee, chargeableKg, distanceKm, basis }.
// Available to delivery partners (own bookings) and logistics staff (booking for them).
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authExternalSeller(userId)) && !(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — delivery partners or logistics only" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const num = (k) => {
            const v = parseFloat(searchParams.get(k));
            return Number.isFinite(v) ? v : undefined;
        };

        const quote = await quoteExternalDeliveryFee({
            sector: searchParams.get("sector") || "",
            weightKg: num("weightKg"),
            lengthCm: num("lengthCm"),
            widthCm: num("widthCm"),
            heightCm: num("heightCm"),
            dropLat: num("dropLat"),
            dropLng: num("dropLng"),
            distanceKm: num("distanceKm"),
        });
        return NextResponse.json(quote);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
