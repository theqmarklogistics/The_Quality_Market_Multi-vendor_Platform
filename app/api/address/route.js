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
        const data = { ...(body.address ?? body), userId };
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
        const addresses = await prisma.address.findMany({
            where: { userId }
        });
        return NextResponse.json({ addresses });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.code || error.message}, { status: 400 });
    }
}