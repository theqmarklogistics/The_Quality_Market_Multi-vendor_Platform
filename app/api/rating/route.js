import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";

const ratingLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });


// Add new rating

export async function POST(request) {
    const ip = getClientIp(request);
    const rl = ratingLimiter(`rating:${ip}`);
    if (!rl.success) {
        return NextResponse.json(
            { error: 'Too many requests. Please slow down.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
        );
    }

    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { orderId, productId, rating, review } = await request.json();
        if (!rating || !Number.isInteger(Number(rating)) || rating < 1 || rating > 5) {
            return NextResponse.json({ error: "Rating must be a whole number between 1 and 5" }, { status: 400 });
        }
        const order = await prisma.order.findFirst({
            where: {
                id: orderId, userId, status: "DELIVERED"
            }
        });
        if(!order){
            return NextResponse.json({ error: "Order not found" }, { status: 400 });
        } 
        const isAlreadyRated = await prisma.rating.findFirst({
            where: {
                userId, productId, orderId
            }
        });
        if(isAlreadyRated){
            return NextResponse.json({ error: "You have already rated this product" }, { status: 400 });
        }
        const response = await prisma.rating.create({
            data: {
                userId, productId, orderId, rating, review
            }
        });
        return NextResponse.json({ message: "Rating added successfully" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}


// Get all rating for a user

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if(!userId){
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const ratings = await prisma.rating.findMany({
            where: { userId }
        });
        return NextResponse.json({ ratings });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}