import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";
import { geocodeRwAddress } from "@/lib/geocode";

const addressLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });

//add new address
export async function POST(request) {
    const rl = addressLimiter(`address:${getClientIp(request)}`);
    if (!rl.success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ error: "You must be signed in to save an address" }, { status: 401 });
        }

        const body = await request.json();
        const input = body.address ?? body;

        // Phone is mandatory — riders and support must be able to reach the customer.
        const phone = String(input.phone || "").trim();
        if (!/^\+?\d[\d\s-]{6,17}$/.test(phone)) {
            return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
        }

        // Preferred: an exact pinned location (powers hub-distance and rider routing).
        // Fallback: when the customer hasn't shared their location, they must describe
        // it down to the village level and we geocode an approximate point instead.
        let latitude = Number(input.latitude);
        let longitude = Number(input.longitude);
        const hasPin =
            Number.isFinite(latitude) && Number.isFinite(longitude) &&
            latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

        const village = String(input.village || "").trim() || null;

        if (!hasPin) {
            if (!village) {
                return NextResponse.json(
                    { error: "Pin your location, or describe your address down to the village (umudugudu) so we can locate you." },
                    { status: 400 }
                );
            }
            const geo = await geocodeRwAddress({
                village,
                sector: input.sector,
                district: input.city,
                province: input.state,
            });
            latitude = geo?.lat ?? null;
            longitude = geo?.lng ?? null;
        }

        const data = { ...input, phone, village, userId, latitude, longitude };
        const newAddress = await prisma.address.create({
            data
        });
        return NextResponse.json({ newAddress, message: "Address added successfully" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message}, { status: 400 });
    }
}

// get user addresses for a user
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ addresses: [] });
        const addresses = await prisma.address.findMany({
            where: { userId }
        });
        return NextResponse.json({ addresses });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.code || error.message}, { status: 400 });
    }
}