import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

const ALLOWED_ROLES = [
    'CUSTOMER',
    'ADMIN',
    'SELLER',
    'LOGISTICS_MANAGER',
    'FINANCIAL_OPERATIONAL',
    'WAREHOUSE_KEEPER',
]

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const users = await prisma.user.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, name: true, email: true, image: true, role: true },
        });

        return NextResponse.json({ users });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { email, role } = await request.json();
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedRole = String(role || '').trim();

        if (!normalizedEmail) {
            return NextResponse.json({ error: 'Missing email' }, { status: 400 });
        }

        if (!ALLOWED_ROLES.includes(normalizedRole)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }

        const user = await prisma.user.findFirst({ where: { email: normalizedEmail } });
        if (!user) {
            return NextResponse.json({ error: 'User not found. They must sign in once before a role can be assigned.' }, { status: 404 });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { role: normalizedRole },
        });

        return NextResponse.json({ message: 'User role updated successfully' });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}