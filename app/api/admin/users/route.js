import { clerkClient, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { sendRoleInviteEmail } from "@/lib/email";

const ALLOWED_ROLES = [
    'LOGISTICS_MANAGER',
    'FINANCIAL_OPERATIONAL',
    'WAREHOUSE_KEEPER',
    'RIDER',
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

        const existing = await prisma.user.findFirst({ where: { email: normalizedEmail } });
        if (existing) {
            await prisma.user.update({
                where: { id: existing.id },
                data: {
                    role: normalizedRole,
                    // Ensure a rider always has a profile dispatch can manage.
                    ...(normalizedRole === 'RIDER'
                        ? { riderProfile: { upsert: { create: {}, update: {} } } }
                        : {}),
                },
            });

            return NextResponse.json({ message: 'User role updated successfully' });
        }

        const client = await clerkClient();
        const invitation = await client.invitations.createInvitation({
            emailAddress: normalizedEmail,
            publicMetadata: { role: normalizedRole },
            redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://thequalitymarket.com'}/sign-in`,
        });

        const inviteUrl = invitation?.url;
        if (inviteUrl) {
            await sendRoleInviteEmail({
                to: normalizedEmail,
                role: normalizedRole,
                inviteUrl,
            });
        }

        return NextResponse.json({ message: 'Invite sent successfully' });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}