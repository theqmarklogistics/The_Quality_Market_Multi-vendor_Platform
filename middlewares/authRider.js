import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

// Returns true if the user is a RIDER (or an admin, who can act on any rider flow).
const authRider = async (userId) => {
    try {
        if (!userId) return false;
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });
        if (userRecord?.role === 'RIDER') return true;
        return await authAdmin(userId);
    } catch (error) {
        console.error(error);
        return false;
    }
};

export default authRider;
