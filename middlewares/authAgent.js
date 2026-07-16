import prisma from "@/lib/prisma";

// AGENT authorization with Clerk JWT fast path (mirrors authRider).
// Fast path: read `role` from `auth().sessionClaims.publicMetadata.role`.
// Falls back to Prisma when the claim is absent, then to authAdmin so an
// ADMIN can act on any agent flow.
const authAgent = async (userId) => {
    try {
        if (!userId) return false;

        // Lazy import to keep `auth()` out of cold-start cost when not needed.
        const { auth } = await import("@clerk/nextjs/server");
        const { sessionClaims } = await auth();
        const roleFromClaims = sessionClaims?.publicMetadata?.role;
        if (roleFromClaims === 'AGENT') return true;
        if (roleFromClaims === 'ADMIN') return true;

        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });
        if (userRecord?.role === 'AGENT') return true;

        const { default: authAdmin } = await import("@/middlewares/authAdmin");
        return await authAdmin(userId);
    } catch (error) {
        console.error(error);
        return false;
    }
};

export default authAgent;
