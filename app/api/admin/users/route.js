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
    'EXTERNAL_SELLER',
    'AGENT',
]

// Roles whose contact card (phone + location) is published on the public
// delivery-network page — they get a StaffProfile the admin can fill in.
const STAFF_PROFILE_ROLES = ['AGENT', 'LOGISTICS_MANAGER']

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const users = await prisma.user.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true, name: true, email: true, image: true, role: true, isActive: true,
                staffProfile: { select: { phone: true, sector: true, landmark: true, isPublic: true } },
                _count: { select: { buyerOrders: true, returns: true } },
                store: { select: { id: true } },
            },
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
                data: { role: normalizedRole },
            });

            // Ensure a rider always has a profile dispatch can manage. Done as
            // plain single statements (find then create) — a simple, portable pattern
            // that avoids relying on nested-write / upsert transaction semantics.
            if (normalizedRole === 'RIDER') {
                const profile = await prisma.riderProfile.findUnique({ where: { userId: existing.id } });
                if (!profile) {
                    await prisma.riderProfile.create({ data: { userId: existing.id } });
                }
            }

            // Agents / logistics managers get a StaffProfile so the admin can
            // record their public phone + location for the delivery-network page.
            if (STAFF_PROFILE_ROLES.includes(normalizedRole)) {
                const profile = await prisma.staffProfile.findUnique({ where: { userId: existing.id } });
                if (!profile) {
                    await prisma.staffProfile.create({ data: { userId: existing.id } });
                }
            }

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
        console.error('Invite/role update failed:', error);
        // Surface the real cause — Clerk wraps details in error.errors[], and a
        // bare error.message can be just the HTTP status text ("Bad Request").
        const detail =
            error?.errors?.[0]?.longMessage ||
            error?.errors?.[0]?.message ||
            error?.message ||
            error?.code ||
            'Unknown error';
        return NextResponse.json({ error: detail }, { status: 400 });
    }
}