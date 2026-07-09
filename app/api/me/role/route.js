import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

// Lightweight role lookup for the current user — used by the web navbar and the
// mobile app to show the right dashboard shortcuts (Admin / Rider / Logistics).
//
// The DB `role` is the source of truth for most roles, but admins can also be
// bootstrapped via the ADMIN_EMAIL allowlist or a JWT publicMetadata claim
// (see authAdmin). Mirror that here so an email-allowlisted admin whose DB role
// isn't literally ADMIN still resolves to ADMIN for role-gated UI — matching the
// web behaviour, where the navbar's admin check goes through authAdmin.
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ role: null }, { status: 200 });

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        let role = user?.role ?? null;

        // Upgrade to ADMIN when the caller is an admin by claim/DB/email but the
        // DB row doesn't yet carry the ADMIN role.
        if (role !== 'ADMIN' && (await authAdmin(userId))) {
            role = 'ADMIN';
        }

        return NextResponse.json({ role });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ role: null }, { status: 200 });
    }
}
