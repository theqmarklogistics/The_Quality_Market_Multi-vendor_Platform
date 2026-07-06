import prisma from "@/lib/prisma";

// Returns storeId (string) when the user's store is approved & active.
// Returns { reason } when access is denied (for better UX).
//
// Performance:
//   - Reads `role` from Clerk JWT `publicMetadata` first to short-circuit users
//     who clearly aren't sellers (no DB roundtrip). EXTERNAL_SELLER also has no
//     platform store, so we deny here.
//   - Queries `Store` by `userId` (unique index) instead of user.findUnique +
//     include: { store: true } — eliminates the User join entirely.
const authSeller = async (userId) => {
    try {
        if (!userId) return { reason: 'unauthenticated' };

        // Fast path — role from JWT publicMetadata.
        try {
            const { auth } = await import("@clerk/nextjs/server");
            const { sessionClaims } = await auth();
            const roleFromClaims = sessionClaims?.publicMetadata?.role;
            if (roleFromClaims && roleFromClaims !== 'SELLER' && roleFromClaims !== 'ADMIN') {
                // EXTERNAL_SELLER / RIDER / LOGISTICS_MANAGER / FINANCIAL_OPERATIONAL /
                // WAREHOUSE_KEEPER all manage their own flows; they can't own a store.
                return { reason: 'not_seller' };
            }
        } catch (_) {
            // ignore — fall through to DB lookup
        }

        // Single-table lookup on Store (userId has a @unique index → no JOIN needed).
        const store = await prisma.store.findUnique({
            where: { userId },
            select: {
                id: true,
                status: true,
                isActive: true,
                rejectionNotes: true,
            },
        });

        if (!store) return { reason: 'no_store' };

        const status = String(store.status).toLowerCase();
        if (status === 'rejected') return { reason: 'store_rejected', notes: store.rejectionNotes };
        if (status !== 'approved') return { reason: 'store_pending' };
        if (!store.isActive) return { reason: 'store_inactive' };

        return store.id; // ← truthy string = approved
    } catch (error) {
        console.error(error);
        return { reason: 'error' };
    }
};

export default authSeller;
