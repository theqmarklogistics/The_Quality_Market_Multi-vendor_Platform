import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

//add new address
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const body = await request.json();
        const data = body.address ?? body;
        data.userId = userId;
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