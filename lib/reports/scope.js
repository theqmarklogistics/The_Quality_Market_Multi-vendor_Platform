import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";
import authSeller from "@/middlewares/authSeller";
import { ROLE_REPORTS } from "./catalog";

// Resolve the reporting scope for a signed-in user. This is the security
// boundary: it decides the user's role, which store (if any) their data is
// restricted to, and the exact set of report types they may run. The API
// consults ONLY this — never a role/store value sent by the client — so a
// seller can never request another store's (or a platform-wide) report.
//
// Returns null when the user has no reporting access at all.
//   {
//     role: 'ADMIN' | 'FINANCIAL_OPERATIONAL' | 'SELLER',
//     storeId: string | null,   // non-null ⇒ every query is filtered to this store
//     allowed: string[],        // report types this user may run
//     scopeLabel: string,       // human label shown on the report header
//   }
export async function resolveReportScope(userId) {
    if (!userId) return null;

    // Admin — role claim, DB role, or the email allowlist (see authAdmin).
    // Admins see everything, platform-wide (storeId = null).
    if (await authAdmin(userId)) {
        return {
            role: 'ADMIN',
            storeId: null,
            allowed: ROLE_REPORTS.ADMIN,
            scopeLabel: 'Platform-wide · all stores',
        };
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    const role = user?.role;

    // Financial operations — the money-facing reports, platform-wide.
    if (role === 'FINANCIAL_OPERATIONAL') {
        return {
            role,
            storeId: null,
            allowed: ROLE_REPORTS.FINANCIAL_OPERATIONAL,
            scopeLabel: 'Platform-wide · financial operations',
        };
    }

    // Logistics manager — the delivery-network report, across all shipments.
    if (role === 'LOGISTICS_MANAGER') {
        return {
            role,
            storeId: null,
            allowed: ROLE_REPORTS.LOGISTICS_MANAGER,
            scopeLabel: 'Delivery network · logistics',
        };
    }

    // Seller — only their own store, and only once it's approved & active.
    if (role === 'SELLER') {
        const storeId = await authSeller(userId);
        if (typeof storeId !== 'string') return null; // pending / rejected / inactive
        const store = await prisma.store.findUnique({
            where: { id: storeId },
            select: { name: true },
        });
        return {
            role,
            storeId,
            allowed: ROLE_REPORTS.SELLER,
            scopeLabel: `Your store · ${store?.name || 'My store'}`,
        };
    }

    return null;
}
