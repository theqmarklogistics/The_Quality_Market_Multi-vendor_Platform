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

        // The location is mandatory: either an exact GPS pin, or the administrative
        // address recorded down to the cell level (district → sector → cell,
        // village optional) so riders can always locate the customer.
        const district = String(input.district || input.city || "").trim() || null;
        const sector = String(input.sector || "").trim() || null;
        const cell = String(input.cell || "").trim() || null;
        const village = String(input.village || "").trim() || null;

        // Preferred: an exact pinned location (powers hub-distance and rider routing).
        // Fallback: geocode an approximate point from the cell/village description.
        let latitude = Number(input.latitude);
        let longitude = Number(input.longitude);
        const hasPin =
            Number.isFinite(latitude) && Number.isFinite(longitude) &&
            latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

        if (!hasPin && (!district || !sector || !cell)) {
            return NextResponse.json(
                { error: "Pin your location, or select your district, sector and cell so we can locate you." },
                { status: 400 }
            );
        }

        if (!hasPin) {
            const geo = await geocodeRwAddress({
                village: village || cell,
                sector,
                district,
                province: input.state,
            });
            latitude = geo?.lat ?? null;
            longitude = geo?.lng ?? null;
        }

        const data = { ...input, phone, district, sector, cell, village, userId, latitude, longitude };
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