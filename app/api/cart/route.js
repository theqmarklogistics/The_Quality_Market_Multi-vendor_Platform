import { getAuth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";


// update cart
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const cart = await request.json();
        try {
            await prisma.user.update({
                where: { id: userId },
                data: { cart }
            });
        } catch (updateError) {
            if (updateError?.code === 'P2025') {
                const client = await clerkClient();
                const clerkUser = await client.users.getUser(userId);
                const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? '';
                const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || 'User';
                await prisma.user.create({
                    data: {
                        id: userId,
                        name,
                        email,
                        image: clerkUser.imageUrl ?? '',
                        cart: cart ?? {}
                    }
                });
            } else {
                throw updateError;
            }
        }
        return NextResponse.json({ message: "Cart updated successfully" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message}, { status: 400 });
    }
}

// get user cart
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { cart: true }
        });
        return NextResponse.json({ cart: user?.cart ?? {} });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message}, { status: 400 });
    }
}