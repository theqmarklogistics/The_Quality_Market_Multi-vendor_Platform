import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";

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

        // Geolocation is mandatory — it powers hub-distance and rider routing.
        const latitude = Number(input.latitude);
        const longitude = Number(input.longitude);
        if (
            !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
            latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
        ) {
            return NextResponse.json({ error: "A pinned location is required to save an address." }, { status: 400 });
        }

        const data = { ...input, userId, latitude, longitude };
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