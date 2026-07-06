import prisma from "@/lib/prisma";

// EXTERNAL_SELLER authorization with Clerk JWT fast path.
const authExternalSeller = async (userId) => {
    try {
        if (!userId) return false;

        const { auth } = await import("@clerk/nextjs/server");
        const { sessionClaims } = await auth();
        const roleFromClaims = sessionClaims?.publicMetadata?.role;
        if (roleFromClaims === 'EXTERNAL_SELLER') return true;
        if (roleFromClaims === 'ADMIN') return true;

        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (userRecord?.role === 'EXTERNAL_SELLER') return true;

        const { default: authAdmin } = await import("@/middlewares/authAdmin");
        return await authAdmin(userId);
    } catch (error) {
        console.error(error);
        return false;
    }
};

export default authExternalSeller;
