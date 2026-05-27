import prisma from "@/lib/prisma";

// Returns storeId (string) when approved & active.
// Returns an object { reason } explaining why access was denied (for better UX).
const authSeller = async (userId) => {
    try {
        if (!userId) return { reason: 'unauthenticated' };

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { store: true }
        });

        if (!user) return { reason: 'user_not_found' };
        if (!user.store) return { reason: 'no_store' };

        const status = String(user.store.status).toLowerCase();

        if (status === 'rejected') return { reason: 'store_rejected', notes: user.store.rejectionNotes };
        if (status !== 'approved') return { reason: 'store_pending' };
        if (!user.store.isActive) return { reason: 'store_inactive' };

        return user.store.id; // ← truthy string = approved
    } catch (error) {
        console.error(error);
        return { reason: 'error' };
    }
}

export default authSeller;