import { auth, clerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// Admin authorization.
//
// Fast path: read `role` from Clerk JWT `public_metadata` — populated by the
// `syncUserCreation` Inngest function whenever a user with a staff role is
// created. Zero DB queries on the happy path.
// Slow path: DB lookup for `role`. Final fallback: email allowlist via Clerk
// API (for admins bootstrapped before role metadata was written).
const authAdmin = async (userId) => {
    try {
        if (!userId) return false;

        // 1. Fast path — role is already in the JWT.
        const { sessionClaims } = await auth();
        const roleFromClaims = sessionClaims?.publicMetadata?.role;
        if (roleFromClaims === 'ADMIN') return true;

        // 2. DB lookup — covers users who lack the publicMetadata role claim.
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });
        if (userRecord?.role === 'ADMIN') return true;

        // 3. Email allowlist via Clerk API — bootstrap fallback.
        const client = await clerkClient();
        const user = await client.users.getUser(userId);

        const adminEmails = (process.env.ADMIN_EMAIL || '')
            .split(',')
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean);

        const primaryEmail = user.emailAddresses
            .find(e => e.id === user.primaryEmailAddressId)
            ?.emailAddress?.toLowerCase();

        return !!primaryEmail && adminEmails.includes(primaryEmail);
    } catch (error) {
        console.error(error);
        return false;
    }
};

export default authAdmin;
