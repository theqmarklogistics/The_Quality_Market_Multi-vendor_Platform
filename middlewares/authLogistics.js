import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

// Returns true if the user is a LOGISTICS_MANAGER (or an admin).
const authLogistics = async (userId) => {
    try {
        if (!userId) return false;
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });
        if (userRecord?.role === 'LOGISTICS_MANAGER') return true;
        return await authAdmin(userId);
    } catch (error) {
        console.error(error);
        return false;
    }
};

export default authLogistics;
