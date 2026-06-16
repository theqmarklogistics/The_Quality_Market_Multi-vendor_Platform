import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

// Returns true if the user is an EXTERNAL_SELLER (off-platform delivery partner)
// or an admin. Mirrors authLogistics.
const authExternalSeller = async (userId) => {
    try {
        if (!userId) return false;
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (userRecord?.role === 'EXTERNAL_SELLER') return true;
        return await authAdmin(userId);
    } catch (error) {
        console.error(error);
        return false;
    }
};

export default authExternalSeller;
