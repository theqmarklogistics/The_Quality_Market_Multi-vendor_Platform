import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import authExternalSeller from "@/middlewares/authExternalSeller";
import authLogistics from "@/middlewares/authLogistics";
import authRider from "@/middlewares/authRider";
import { quoteExternalDeliveryFee, getExternalDeliveryConfig } from "@/lib/externalDelivery";
import { geocodeRwAddress } from "@/lib/geocode";

// GET — live delivery quote. Params: sector, weightKg, lengthCm, widthCm, heightCm,
// dropLat, dropLng (or distanceKm), originLat, originLng (pickup/rider origin —
// overrides the hub), district, cell, village. Returns { fee, chargeableKg,
// distanceKm, basis, locationSource? }.
// Without a drop pin, the recorded address (district → sector → cell/village) is
// geocoded so the distance is still measured from its geographic location.
// Available to delivery partners (own bookings) and logistics staff (booking for them).
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authExternalSeller(userId)) && !(await authLogistics(userId)) && !(await authRider(userId))) {
            return NextResponse.json({ error: "Forbidden — delivery partners, logistics or riders only" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const num = (k) => {
            const v = parseFloat(searchParams.get(k));
            return Number.isFinite(v) ? v : undefined;
        };

        const sector = searchParams.get("sector") || "";
        const wantsExpress = searchParams.get("express") === "1" || searchParams.get("express") === "true";
        if (wantsExpress) {
            const deliveryCfg = await getExternalDeliveryConfig();
            if (deliveryCfg.expressEnabled === false) {
                return NextResponse.json({ error: "Express delivery is currently unavailable." }, { status: 400 });
            }
        }
        let dropLat = num("dropLat");
        let dropLng = num("dropLng");
        let locationSource = dropLat != null && dropLng != null ? "pin" : null;

        // Second option after a shared/pinned location: derive the drop point from
        // the geographic location of the recorded address.
        if (dropLat == null || dropLng == null) {
            const district = (searchParams.get("district") || "").trim();
            const cell = (searchParams.get("cell") || "").trim();
            const village = (searchParams.get("village") || "").trim();
            if (district && sector && cell) {
                const geo = await geocodeRwAddress({ village: village || cell, sector, district, province: "Kigali" });
                if (geo) {
                    dropLat = geo.lat;
                    dropLng = geo.lng;
                    locationSource = "address";
                }
            }
        }

        const quote = await quoteExternalDeliveryFee({
            sector,
            weightKg: num("weightKg"),
            lengthCm: num("lengthCm"),
            widthCm: num("widthCm"),
            heightCm: num("heightCm"),
            dropLat,
            dropLng,
            originLat: num("originLat"),
            originLng: num("originLng"),
            distanceKm: num("distanceKm"),
            // EXPRESS pricing (instant dispatch, express base rate).
            express: wantsExpress,
        });
        return NextResponse.json({ ...quote, ...(locationSource && { locationSource }) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
