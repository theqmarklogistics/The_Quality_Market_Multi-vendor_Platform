import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Lightweight role lookup for the current user — used by the navbar to show
// the right dashboard shortcuts (Rider / Logistics).
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ role: null }, { status: 200 });

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        return NextResponse.json({ role: user?.role ?? null });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ role: null }, { status: 200 });
    }
}
